import { createHash } from 'node:crypto';

import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  VideoProvider as VideoProviderKind,
  VideoStatus,
  type BunnyUploadTicket,
  type CreateBunnyUploadRequest,
} from '@app/shared';

import { decideReady } from './activation-rule';
import { BunnyClient, BunnyError, type BunnyVideo } from './bunny.client';
import { BunnyConfig } from './bunny.config';
import { BunnyProvider } from './bunny.provider';
import {
  failureReasonFor,
  mapVideoStatus,
  mapWebhookStatus,
} from './bunny-signing';
import { Prisma, WebhookProvider } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { sanitizeOriginalName } from '../original-name';
import type { VideoAssetRef } from '../video-provider';
import { VideoProviders } from '../video-providers';

/** An UPLOADING asset is only polled once its browser upload should be over. */
const UPLOADING_GRACE_MS = 15 * 60 * 1000;
/** An upload that never finished within a day is given up on. */
const UPLOAD_ABANDON_MS = 24 * 60 * 60 * 1000;
const RECONCILE_BATCH = 100;

const FILE_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export type ApplyOutcome = 'applied' | 'duplicate' | 'stale' | 'ignored';

interface EventKey {
  /** sha256 of the raw webhook body. */
  id: string;
  /** The webhook's own status agreed with what Bunny reported when asked. */
  confirmed: boolean;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The Bunny side of the video lifecycle: starting an upload, and moving an
 * asset from UPLOADING to READY or FAILED. The webhook and the reconcile job
 * both end in `applyFetched`, so there is exactly one transition code path,
 * and it only ever acts on a status fetched from Bunny's API.
 */
@Injectable()
export class BunnyVideoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BunnyVideoService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BunnyConfig) private readonly config: BunnyConfig,
    @Inject(BunnyClient) private readonly client: BunnyClient,
    @Inject(BunnyProvider) private readonly provider: BunnyProvider,
    @Inject(VideoProviders) private readonly providers: VideoProviders,
  ) {}

  onModuleInit(): void {
    const seconds = this.config.reconcileIntervalSec;
    if (seconds <= 0 || !this.config.settings) return;
    this.timer = setInterval(() => {
      void this.reconcileOnce();
    }, seconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ----- upload ---------------------------------------------------------------

  async createUpload(
    lessonId: string,
    input: CreateBunnyUploadRequest,
    maxBytes: number,
  ): Promise<BunnyUploadTicket> {
    const settings = this.config.settings;
    if (!settings) {
      throw new ConflictException(
        'Bunny Stream is not configured; upload to /videos/local instead',
      );
    }
    if (input.sizeBytes !== undefined && input.sizeBytes > maxBytes) {
      throw new PayloadTooLargeException(
        'The video is larger than the server allows',
      );
    }
    const originalName = sanitizeOriginalName(input.originalName);
    const extension = originalName.split('.').pop()?.toLowerCase() ?? '';
    const filetype = FILE_TYPES[extension];
    if (!filetype) {
      throw new UnsupportedMediaTypeException(
        'Only MP4 and WebM videos are accepted',
      );
    }

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        levelId: true,
        sortOrder: true,
        level: { select: { slug: true } },
      },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const earlier = await this.prisma.lesson.count({
      where: { levelId: lesson.levelId, sortOrder: { lt: lesson.sortOrder } },
    });
    const title = `${lesson.level.slug} / ${earlier + 1} / ${originalName}`;

    let upload;
    try {
      upload = await this.provider.createUpload(title);
    } catch (error) {
      this.logger.error(`Could not create the Bunny video: ${message(error)}`);
      throw new BadGatewayException('Bunny Stream could not create the video');
    }

    try {
      await this.prisma.videoAsset.create({
        data: {
          id: upload.assetId,
          lessonId,
          provider: VideoProviderKind.BUNNY,
          status: VideoStatus.UPLOADING,
          mime: filetype,
          sizeBytes:
            input.sizeBytes === undefined ? null : BigInt(input.sizeBytes),
          durationSec: input.durationSec ?? null,
          originalName,
          bunnyLibraryId: upload.bunnyLibraryId,
          bunnyVideoId: upload.bunnyVideoId,
        },
      });
    } catch (error) {
      // The lesson vanished or the database failed: do not leak a Bunny video.
      await this.provider.deleteById(upload.bunnyVideoId).catch((cleanup) => {
        this.logger.error(
          `Could not delete orphaned Bunny video: ${message(cleanup)}`,
        );
      });
      throw error;
    }

    return {
      assetId: upload.assetId,
      tus: upload.tus,
      metadata: { filetype, title },
    };
  }

  /** The browser finished its TUS upload: UPLOADING becomes PROCESSING. */
  async markUploaded(assetId: string): Promise<void> {
    const asset = await this.prisma.videoAsset.findUnique({
      where: { id: assetId },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException('Video not found');
    // Only a BUNNY asset still UPLOADING moves; anything else is a no-op.
    await this.prisma.videoAsset.updateMany({
      where: {
        id: assetId,
        provider: VideoProviderKind.BUNNY,
        status: VideoStatus.UPLOADING,
      },
      data: { status: VideoStatus.PROCESSING },
    });
  }

  // ----- webhook --------------------------------------------------------------

  /**
   * Handles one verified webhook. The delivered status is only a hint that
   * something changed: the asset follows what `getVideo` reports.
   */
  async handleWebhook(event: {
    rawBody: Buffer;
    libraryId: string;
    guid: string;
    status: number;
  }): Promise<ApplyOutcome> {
    const settings = this.config.settings;
    if (!settings || event.libraryId !== settings.libraryId) return 'ignored';
    const hinted = mapWebhookStatus(event.status);
    if (hinted === null) return 'ignored';

    const id = createHash('sha256').update(event.rawBody).digest('hex');
    const seen = await this.prisma.webhookEvent.findUnique({
      where: {
        provider_externalEventId: {
          provider: WebhookProvider.BUNNY,
          externalEventId: id,
        },
      },
      select: { id: true },
    });
    if (seen) return 'duplicate';

    const asset = await this.prisma.videoAsset.findUnique({
      where: { bunnyVideoId: event.guid },
      select: { id: true, lessonId: true },
    });
    if (!asset) return 'ignored';

    const fetchedAt = new Date();
    let video: BunnyVideo;
    try {
      video = await this.client.getVideo(event.guid);
    } catch (error) {
      if (error instanceof BunnyError && error.status === 404) return 'ignored';
      this.logger.error(`Webhook re-fetch failed: ${message(error)}`);
      // 5xx so Bunny delivers the event again.
      throw new BadGatewayException('Bunny Stream could not be reached');
    }
    return this.applyFetched(asset, video, fetchedAt, {
      id,
      confirmed: mapVideoStatus(video.status) === hinted,
    });
  }

  // ----- reconcile ------------------------------------------------------------

  /** One pass over the assets still waiting on Bunny. Safe to call any time. */
  async reconcileOnce(
    now = new Date(),
  ): Promise<{ checked: number; applied: number; abandoned: number }> {
    const result = { checked: 0, applied: 0, abandoned: 0 };
    if (this.running || !this.config.settings) return result;
    this.running = true;
    try {
      const assets = await this.prisma.videoAsset.findMany({
        where: {
          provider: VideoProviderKind.BUNNY,
          bunnyVideoId: { not: null },
          OR: [
            { status: VideoStatus.PROCESSING },
            {
              status: VideoStatus.UPLOADING,
              createdAt: { lt: new Date(now.getTime() - UPLOADING_GRACE_MS) },
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: RECONCILE_BATCH,
      });
      for (const asset of assets) {
        try {
          if (
            asset.status === VideoStatus.UPLOADING &&
            asset.createdAt.getTime() < now.getTime() - UPLOAD_ABANDON_MS
          ) {
            if (await this.abandon(asset)) result.abandoned += 1;
            continue;
          }
          result.checked += 1;
          const fetchedAt = new Date();
          let video: BunnyVideo;
          try {
            video = await this.client.getVideo(asset.bunnyVideoId as string);
          } catch (error) {
            if (error instanceof BunnyError && error.status === 404) {
              await this.markMissing(asset.id);
              continue;
            }
            throw error;
          }
          if (
            (await this.applyFetched(asset, video, fetchedAt)) === 'applied'
          ) {
            result.applied += 1;
          }
        } catch (error) {
          this.logger.error(
            `Reconciling video ${asset.id} failed: ${message(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Video reconcile failed: ${message(error)}`);
    } finally {
      this.running = false;
    }
    return result;
  }

  private async abandon(
    asset: VideoAssetRef & { id: string },
  ): Promise<boolean> {
    const { count } = await this.prisma.videoAsset.updateMany({
      where: { id: asset.id, status: VideoStatus.UPLOADING },
      data: {
        status: VideoStatus.FAILED,
        failureReason: 'upload-abandoned',
      },
    });
    if (count === 0) return false;
    await this.providers.discard(asset);
    return true;
  }

  private async markMissing(assetId: string): Promise<void> {
    await this.prisma.videoAsset.updateMany({
      where: {
        id: assetId,
        status: { in: [VideoStatus.UPLOADING, VideoStatus.PROCESSING] },
      },
      data: { status: VideoStatus.FAILED, failureReason: 'video-missing' },
    });
  }

  // ----- the one transition ---------------------------------------------------

  /**
   * Applies a status fetched from Bunny. In one transaction under the lesson's
   * row lock: skips results older than the asset's `lastEventAt`, treats READY
   * as final, and on READY applies the activation rule (newer wins, the loser
   * is deleted). Stored videos of replaced assets are removed after commit.
   */
  async applyFetched(
    target: { id: string; lessonId: string },
    video: BunnyVideo,
    fetchedAt: Date,
    event?: EventKey,
  ): Promise<ApplyOutcome> {
    const next = mapVideoStatus(video.status);
    if (next === null) return 'ignored';

    let outcome: ApplyOutcome;
    let discards: VideoAssetRef[];
    try {
      ({ outcome, discards } = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "Lesson" WHERE id = ${target.lessonId}::uuid FOR UPDATE`;
        const asset = await tx.videoAsset.findUnique({
          where: { id: target.id },
        });
        const none = { outcome: 'ignored' as ApplyOutcome, discards: [] };
        if (!asset) return none;
        if (asset.lastEventAt && asset.lastEventAt > fetchedAt) {
          return { outcome: 'stale' as ApplyOutcome, discards: [] };
        }
        if (asset.status === VideoStatus.READY) return none;

        const removed: VideoAssetRef[] = [];
        let changed: boolean;
        const data: Prisma.VideoAssetUpdateInput = { lastEventAt: fetchedAt };

        if (next === VideoStatus.PROCESSING) {
          changed = asset.status !== VideoStatus.PROCESSING;
          data.status = VideoStatus.PROCESSING;
          data.failureReason = null;
        } else if (next === VideoStatus.FAILED) {
          const reason = failureReasonFor(video.status);
          changed =
            asset.status !== VideoStatus.FAILED ||
            asset.failureReason !== reason;
          data.status = VideoStatus.FAILED;
          data.failureReason = reason;
        } else {
          const lesson = await tx.lesson.findUnique({
            where: { id: asset.lessonId },
            select: { activeVideo: true },
          });
          const decision = decideReady(asset, lesson?.activeVideo ?? null);
          changed = true;
          if (decision === 'discard') {
            await tx.videoAsset.delete({ where: { id: asset.id } });
            removed.push(asset);
          } else {
            data.status = VideoStatus.READY;
            data.failureReason = null;
            if (video.length > 0) data.durationSec = Math.round(video.length);
            await tx.videoAsset.update({ where: { id: asset.id }, data });
            await tx.lesson.update({
              where: { id: asset.lessonId },
              data: { activeVideoId: asset.id },
            });
            const previous = lesson?.activeVideo;
            if (previous && previous.id !== asset.id) {
              await tx.videoAsset.delete({ where: { id: previous.id } });
              removed.push(previous);
            }
            // A failed attempt older than the video that replaced it is moot.
            const stale = await tx.videoAsset.findMany({
              where: {
                lessonId: asset.lessonId,
                status: VideoStatus.FAILED,
                createdAt: { lt: asset.createdAt },
                id: { not: asset.id },
              },
            });
            for (const failed of stale) {
              await tx.videoAsset.delete({ where: { id: failed.id } });
              removed.push(failed);
            }
          }
        }

        if (next !== VideoStatus.READY) {
          await tx.videoAsset.update({ where: { id: asset.id }, data });
        }
        if (event && (changed || event.confirmed)) {
          await tx.webhookEvent.create({
            data: {
              provider: WebhookProvider.BUNNY,
              externalEventId: event.id,
            },
          });
        }
        return {
          outcome: (changed ? 'applied' : 'ignored') as ApplyOutcome,
          discards: removed,
        };
      }));
    } catch (error) {
      if (event && isUniqueViolation(error)) return 'duplicate';
      throw error;
    }

    for (const asset of discards) await this.providers.discard(asset);
    return outcome;
  }
}
