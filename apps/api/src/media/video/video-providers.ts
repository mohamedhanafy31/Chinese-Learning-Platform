import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { VideoProvider as VideoProviderKind } from '@app/shared';

import { BunnyProvider } from './bunny/bunny.provider';
import { BunnyError } from './bunny/bunny.client';
import { LocalProvider } from './local.provider';
import { PrismaService } from '../../prisma/prisma.service';
import type { VideoAssetRef, VideoProvider } from './video-provider';

export const VIDEO_DELETE_SLEEP = Symbol('VIDEO_DELETE_SLEEP');
export const VIDEO_DELETE_CLOCK = Symbol('VIDEO_DELETE_CLOCK');
export type VideoDeleteSleep = (milliseconds: number) => Promise<void>;
export type VideoDeleteClock = () => Date;

const defaultSleep: VideoDeleteSleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const RETRY_DELAYS_MS = [250, 1000] as const;

/** Picks the provider that owns an asset, whatever is active for new uploads. */
@Injectable()
export class VideoProviders {
  private readonly logger = new Logger(VideoProviders.name);
  private readonly sleep: VideoDeleteSleep;

  constructor(
    @Inject(LocalProvider) readonly local: LocalProvider,
    @Inject(BunnyProvider) readonly bunny: BunnyProvider,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(VIDEO_DELETE_SLEEP) sleep?: VideoDeleteSleep,
    @Optional() @Inject(VIDEO_DELETE_CLOCK) now?: VideoDeleteClock,
  ) {
    this.sleep = sleep ?? defaultSleep;
    this.now = now ?? (() => new Date());
  }

  private readonly now: VideoDeleteClock;

  for(kind: VideoProviderKind): VideoProvider {
    return kind === VideoProviderKind.BUNNY ? this.bunny : this.local;
  }

  /** Deletes an asset's stored video after its row is gone; logs, never throws. */
  async discard(asset: VideoAssetRef): Promise<void> {
    const provider = this.for(asset.provider);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await provider.delete(asset);
        return;
      } catch (error) {
        if (attempt < RETRY_DELAYS_MS.length) {
          await this.sleep(RETRY_DELAYS_MS[attempt]!);
          continue;
        }
        const identifiers =
          asset.provider === VideoProviderKind.BUNNY
            ? ` bunnyVideoId=${asset.bunnyVideoId ?? 'unknown'} libraryId=${asset.bunnyLibraryId ?? 'unknown'}`
            : '';
        const errorMessage =
          asset.provider === VideoProviderKind.BUNNY
            ? error instanceof BunnyError
              ? error.message
              : 'Bunny delete request failed'
            : error instanceof Error
              ? error.message
              : String(error);
        if (asset.provider === VideoProviderKind.BUNNY && asset.bunnyVideoId) {
          try {
            const nextAttemptAt = new Date(this.now().getTime() + 15 * 60_000);
            await this.prisma.pendingVideoDelete.upsert({
              where: { bunnyVideoId: asset.bunnyVideoId },
              create: {
                bunnyVideoId: asset.bunnyVideoId,
                bunnyLibraryId: asset.bunnyLibraryId,
                attempts: 3,
                lastError: errorMessage.slice(0, 500),
                nextAttemptAt,
              },
              update: {
                bunnyLibraryId: asset.bunnyLibraryId,
                attempts: 3,
                lastError: errorMessage.slice(0, 500),
                nextAttemptAt,
              },
            });
            this.logger.error(
              `Bunny delete failed after 3 attempts; retry queued: assetId=${asset.id}${identifiers}`,
            );
          } catch {
            this.logger.error(
              `Bunny delete failed after 3 attempts; manual cleanup required because retry could not be queued: assetId=${asset.id}${identifiers}`,
            );
          }
        } else {
          this.logger.error(
            `Video delete failed after 3 attempts; manual cleanup required: provider=${asset.provider} assetId=${asset.id}${identifiers}; ${errorMessage}`,
          );
        }
      }
    }
  }
}
