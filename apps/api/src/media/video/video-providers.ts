import { Inject, Injectable, Logger } from '@nestjs/common';
import { VideoProvider as VideoProviderKind } from '@app/shared';

import { BunnyProvider } from './bunny/bunny.provider';
import { LocalProvider } from './local.provider';
import type { VideoAssetRef, VideoProvider } from './video-provider';

/** Picks the provider that owns an asset, whatever is active for new uploads. */
@Injectable()
export class VideoProviders {
  private readonly logger = new Logger(VideoProviders.name);

  constructor(
    @Inject(LocalProvider) readonly local: LocalProvider,
    @Inject(BunnyProvider) readonly bunny: BunnyProvider,
  ) {}

  for(kind: VideoProviderKind): VideoProvider {
    return kind === VideoProviderKind.BUNNY ? this.bunny : this.local;
  }

  /** Deletes an asset's stored video after its row is gone; logs, never throws. */
  async discard(asset: VideoAssetRef): Promise<void> {
    try {
      await this.for(asset.provider).delete(asset);
    } catch (error) {
      this.logger.error(
        `Could not delete ${asset.provider} video ${asset.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
