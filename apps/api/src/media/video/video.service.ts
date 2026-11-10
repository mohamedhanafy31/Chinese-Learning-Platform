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
  uploadVideoFieldsSchema,
  VideoProvider as VideoProviderKind,
  VideoStatus,
  type ProviderReadiness,
  type UploadedVideo,
  type VideoDiagnostics,
} from '@app/shared';

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
import { removeVideoFile } from './video-files';
import { toAdminVideo } from './video-mapper';
import type { VideoProvider } from './video-provider';
import type { Environment } from '../../config/environment';
import { MediaStorage } from '../media-storage';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_NAME_LENGTH = 255;

/** Browsers send a bare name, but never trust it: no paths, no control chars. */
export function sanitizeOriginalName(name: string | undefined): string {
  const base = path.basename((name ?? '').replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return Array.from(cleaned || 'video')
    .slice(0, MAX_NAME_LENGTH)
    .join('');
}

@Injectable()
export class VideoService implements OnModuleInit {
  private readonly logger = new Logger(VideoService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LocalProvider) private readonly local: LocalProvider,
    @Inject(MediaStorage) private readonly storage: MediaStorage,
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

  diagnostics(): VideoDiagnostics {
    const readiness = this.providerReadiness();
    return { ...readiness, devOnly: this.isDevOnly(readiness) };
  }

  /** The provider that handles new uploads. Always LOCAL until M7. */
  private activeProvider(): VideoProvider {
    return this.local;
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
  ): Promise<UploadedVideo> {
    if (!file) throw new BadRequestException('A file is required');
    const provider = this.activeProvider();
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
        return { row: created, previous: lesson.activeVideo };
      });

      committed = true;
      if (previous) await this.discardFile(previous);
      return { ...toAdminVideo(row), devOnly: this.diagnostics().devOnly };
    } catch (error) {
      if (!committed) {
        await removeVideoFile(this.storage.videosDir, path.basename(file.path));
        await removeVideoFile(this.storage.videosDir, finalKey);
      }
      throw error;
    }
  }

  /** Clears the lesson's video and deletes the asset and its file. Idempotent. */
  async removeActive(lessonId: string): Promise<void> {
    const removed = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Lesson" WHERE id = ${lessonId}::uuid FOR UPDATE`;
      const lesson = await tx.lesson.findUnique({
        where: { id: lessonId },
        select: { activeVideo: true },
      });
      if (!lesson) throw new NotFoundException('Lesson not found');
      if (!lesson.activeVideo) return null;
      await tx.lesson.update({
        where: { id: lessonId },
        data: { activeVideoId: null },
      });
      await tx.videoAsset.delete({ where: { id: lesson.activeVideo.id } });
      return lesson.activeVideo;
    });
    if (removed) await this.discardFile(removed);
  }

  /** Deletes a replaced asset's file after the database has committed. */
  private async discardFile(asset: {
    id: string;
    provider: VideoProviderKind;
    localKey: string | null;
    mime: string | null;
  }): Promise<void> {
    try {
      await this.activeProvider().delete(asset);
    } catch (error) {
      this.logger.error(
        `Could not delete video ${asset.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
