import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { BunnyClient } from './bunny.client';
import { BunnyConfig } from './bunny.config';
import { embedUrl, tusExpiry, tusSignature } from './bunny-signing';
import type {
  PlaybackDescriptor,
  UploadTicket,
  VideoAssetRef,
  VideoProvider,
} from '../video-provider';

export interface BunnyUpload extends UploadTicket {
  provider: 'BUNNY';
  bunnyLibraryId: string;
  bunnyVideoId: string;
  tus: {
    endpoint: string;
    headers: {
      AuthorizationSignature: string;
      AuthorizationExpire: string;
      VideoId: string;
      LibraryId: string;
    };
  };
}

@Injectable()
export class BunnyProvider implements VideoProvider {
  readonly kind = 'BUNNY' as const;

  constructor(
    @Inject(BunnyConfig) private readonly config: BunnyConfig,
    @Inject(BunnyClient) private readonly client: BunnyClient,
  ) {}

  /**
   * Creates the Bunny video record and signs a TUS upload for it. The browser
   * uploads straight to Bunny with these headers; the API key stays here.
   */
  async createUpload(title: string, nowMs = Date.now()): Promise<BunnyUpload> {
    const settings = this.config.require();
    const { guid } = await this.client.createVideo(title);
    const expire = tusExpiry(nowMs);
    return {
      assetId: randomUUID(),
      provider: this.kind,
      bunnyLibraryId: settings.libraryId,
      bunnyVideoId: guid,
      tus: {
        endpoint: `${settings.apiBase}/tusupload`,
        headers: {
          AuthorizationSignature: tusSignature({
            libraryId: settings.libraryId,
            apiKey: settings.apiKey,
            expire,
            videoId: guid,
          }),
          AuthorizationExpire: String(expire),
          VideoId: guid,
          LibraryId: settings.libraryId,
        },
      },
    };
  }

  /** A signed embed that expires after BUNNY_EMBED_TTL_SEC. */
  playback(asset: VideoAssetRef, now = new Date()): PlaybackDescriptor {
    const settings = this.config.require();
    if (!asset.bunnyVideoId) {
      throw new Error(`Video ${asset.id} has no Bunny video id`);
    }
    const expires = Math.floor(now.getTime() / 1000) + settings.embedTtlSec;
    return {
      provider: this.kind,
      embedUrl: embedUrl({
        base: settings.embedBase,
        libraryId: asset.bunnyLibraryId ?? settings.libraryId,
        videoId: asset.bunnyVideoId,
        tokenKey: settings.tokenKey,
        expires,
      }),
      expiresAt: new Date(expires * 1000).toISOString(),
    };
  }

  async delete(asset: VideoAssetRef): Promise<void> {
    if (!asset.bunnyVideoId) return;
    await this.client.deleteVideo(asset.bunnyVideoId);
  }

  /** Best-effort removal of a video that never got a database row. */
  deleteById(guid: string): Promise<void> {
    return this.client.deleteVideo(guid);
  }
}
