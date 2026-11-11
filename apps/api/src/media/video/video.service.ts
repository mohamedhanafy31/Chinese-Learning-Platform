import path from 'node:path';

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createBunnyUploadRequestSchema,
  uploadVideoFieldsSchema,
  VideoProvider as VideoProviderKind,
  VideoStatus,
  type BunnyUploadTicket,
  type ProviderReadiness,
  type UploadedVideo,
  type VideoDiagnostics,
} from '@app/shared';

import { BunnyVideoService } from './bunny/bunny-video.service';

import { LocalProvider } from './local.provider';
import {
  localUploadTarget,
  type StoredVideoUpload,
} from './local-upload.storage';
import {
  BUNNY_ENV_KEYS,
  computeProviderReadiness,
  isPartiallyConfigured,
} from './provider-readiness';
import { sanitizeOriginalName } from './original-name';
import { removeVideoFile } from './video-files';
import { toAdminVideo } from './video-mapper';
import { VideoProviders } from './video-providers';
import type { Environment } from '../../config/environment';
import { MediaStorage } from '../media-storage';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookProvider } from '../../generated/prisma/client';

export { sanitizeOriginalName };

@Injectable()
export class VideoService implements OnModuleInit {
  private readonly logger = new Logger(VideoService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LocalProvider) private readonly local: LocalProvider,
    @Inject(VideoProviders) private readonly providers: VideoProviders,
    @Inject(BunnyVideoService) private readonly bunny: BunnyVideoService,
    @Inject(MediaStorage) private readonly storage: MediaStorage,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}

  onModuleInit(): void {
    localUploadTarget.dir = this.storage.videosDir;
    localUploadTarget.maxBytes = this.config.get('VIDEO_MAX_BYTES', {
      infer: true,
    });

    const readiness = this.providerReadiness();
    if (isPartiallyConfigured(readiness)) {
      // Names only: the values are secrets and are never logged.
      this.logger.warn(
        `Bunny Stream is partially configured (missing ${readiness.bunny.missing.join(', ')}); all of ${BUNNY_ENV_KEYS.join(', ')} are required. Local video storage stays active.`,
      );
    }
    if (this.isDevOnly(readiness)) {
      this.logger.warn(
        'Local video storage is for development only. Configure Bunny Stream before going live.',
      );
    }
  }

  providerReadiness(): ProviderReadiness {
    return computeProviderReadiness({
      BUNNY_LIBRARY_ID: this.config.get('BUNNY_LIBRARY_ID', { infer: true }),
      BUNNY_API_KEY: this.config.get('BUNNY_API_KEY', { infer: true }),
      BUNNY_TOKEN_KEY: this.config.get('BUNNY_TOKEN_KEY', { infer: true }),
      BUNNY_WEBHOOK_SECRET: this.config.get('BUNNY_WEBHOOK_SECRET', {
        infer: true,
      }),
      BUNNY_CDN_HOST: this.config.get('BUNNY_CDN_HOST', { infer: true }),
    });
  }

  /** The active provider and whether it is the development-only one. */
  summary(): { active: ProviderReadiness['active']; devOnly: boolean } {
    const readiness = this.providerReadiness();
    return { active: readiness.active, devOnly: this.isDevOnly(readiness) };
  }

  async diagnostics(): Promise<VideoDiagnostics> {
    const readiness = this.providerReadiness();
    const [local, bunny, processing, failed, lastWebhook] = await Promise.all([
      this.prisma.videoAsset.count({
        where: { provider: VideoProviderKind.LOCAL },
      }),
      this.prisma.videoAsset.count({
        where: { provider: VideoProviderKind.BUNNY },
      }),
      this.prisma.videoAsset.count({
        where: {
          status: { in: [VideoStatus.UPLOADING, VideoStatus.PROCESSING] },
        },
      }),
      this.prisma.videoAsset.count({ where: { status: VideoStatus.FAILED } }),
      this.prisma.webhookEvent.findFirst({
        where: { provider: WebhookProvider.BUNNY },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      }),
    ]);
    return {
      ...readiness,
      devOnly: this.isDevOnly(readiness),
      counts: { local, bunny, processing, failed },
      lastWebhookAt: lastWebhook?.receivedAt.toISOString() ?? null,
    };
  }

  /** Starts a direct-to-Bunny TUS upload (409 unless Bunny is active). */
  async createBunnyUpload(
    lessonId: string,
    body: unknown,
    actorId: string,
  ): Promise<BunnyUploadTicket> {
    const parsed = createBunnyUploadRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: parsed.error.issues,
      });
    }
    const ticket = await this.bunny.createUpload(
      lessonId,
      parsed.data,
      this.config.get('VIDEO_MAX_BYTES', { infer: true }),
    );
    await this.audit.record(this.prisma, {
      actorId,
      action: 'video.upload_bunny',
      entity: 'Lesson',
      entityId: lessonId,
      data: { assetId: ticket.assetId },
    });
    return ticket;
  }

  /** The browser finished its TUS upload. */
  markBunnyUploaded(assetId: string): Promise<void> {
    return this.bunny.markUploaded(assetId);
  }

  private isDevOnly(readiness: ProviderReadiness): boolean {
    return (
      readiness.active === 'LOCAL' &&
      this.config.get('NODE_ENV', { infer: true }) === 'production'
    );
  }

  /**
   * Stores one uploaded file as the lesson's active video. The file is already
   * on disk (streamed by Multer); every failure path removes it.
   */
  async uploadLocal(
    lessonId: string,
    file: StoredVideoUpload | undefined,
    fields: unknown,
    actorId: string,
  ): Promise<UploadedVideo> {
    if (!file) throw new BadRequestException('A file is required');
    // The multipart route is always local, even once Bunny is configured.
    const provider = this.local;
    const ticket = provider.createUpload();
    let finalKey: string | null = null;
    let committed = false;
    try {
      const parsed = uploadVideoFieldsSchema.safeParse(fields ?? {});
      if (!parsed.success) {
        throw new BadRequestException({
          message: 'Validation failed',
          issues: parsed.error.issues,
        });
      }
      const exists = await this.prisma.lesson.findUnique({
        where: { id: lessonId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Lesson not found');

      const stored = await provider.finalize({
        assetId: ticket.assetId,
        tempPath: file.path,
      });
      finalKey = stored.localKey;

      const { row, previous } = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "Lesson" WHERE id = ${lessonId}::uuid FOR UPDATE`;
        const lesson = await tx.lesson.findUnique({
          where: { id: lessonId },
          select: { activeVideo: true },
        });
        if (!lesson) throw new NotFoundException('Lesson not found');
        const created = await tx.videoAsset.create({
          data: {
            id: ticket.assetId,
            lessonId,
            provider: VideoProviderKind.LOCAL,
            status: VideoStatus.READY,
            localKey: stored.localKey,
            mime: stored.mime,
            sizeBytes: BigInt(stored.sizeBytes),
            durationSec: parsed.data.durationSec ?? null,
            originalName: sanitizeOriginalName(file.originalname),
          },
        });
        await tx.lesson.update({
          where: { id: lessonId },
          data: { activeVideoId: created.id },
        });
        if (lesson.activeVideo) {
          await tx.videoAsset.delete({ where: { id: lesson.activeVideo.id } });
        }
        await this.audit.record(tx, {
          actorId,
          action: 'video.upload_local',
          entity: 'Lesson',
          entityId: lessonId,
          data: {
            assetId: created.id,
            sizeBytes: stored.sizeBytes,
            replaced: lesson.activeVideo !== null,
          },
        });
        return { row: created, previous: lesson.activeVideo };
      });

      committed = true;
      if (previous) await this.discardFile(previous);
      return {
        ...toAdminVideo(row),
        devOnly: this.isDevOnly(this.providerReadiness()),
      };
    } catch (error) {
      if (!committed) {
        await removeVideoFile(this.storage.videosDir, path.basename(file.path));
        await removeVideoFile(this.storage.videosDir, finalKey);
      }
      throw error;
    }
  }

  /**
   * Clears the lesson's video and every pending or failed upload, deleting the
   * assets and their stored videos (files or Bunny videos). Idempotent.
   */
  async removeActive(lessonId: string, actorId: string): Promise<void> {
    const removed = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Lesson" WHERE id = ${lessonId}::uuid FOR UPDATE`;
      const lesson = await tx.lesson.findUnique({
        where: { id: lessonId },
        select: { activeVideoId: true },
      });
      if (!lesson) throw new NotFoundException('Lesson not found');
      const assets = await tx.videoAsset.findMany({ where: { lessonId } });
      if (assets.length === 0) return [];
      await tx.lesson.update({
        where: { id: lessonId },
        data: { activeVideoId: null },
      });
      await tx.videoAsset.deleteMany({ where: { lessonId } });
      await this.audit.record(tx, {
        actorId,
        action: 'video.remove',
        entity: 'Lesson',
        entityId: lessonId,
        data: { assets: assets.length },
      });
      return assets;
    });
    await this.discardAssets(removed);
  }

  /** Deletes stored videos of assets whose rows are already gone. */
  async discardAssets(
    assets: Array<{
      id: string;
      provider: VideoProviderKind;
      localKey: string | null;
      mime: string | null;
      bunnyVideoId: string | null;
      bunnyLibraryId: string | null;
    }>,
  ): Promise<void> {
    for (const asset of assets) await this.providers.discard(asset);
  }

  /** Deletes a replaced asset's file after the database has committed. */
  private discardFile(asset: {
    id: string;
    provider: VideoProviderKind;
    localKey: string | null;
    mime: string | null;
    bunnyVideoId: string | null;
    bunnyLibraryId: string | null;
  }): Promise<void> {
    return this.providers.discard(asset);
  }
}
