import { Inject, Injectable, Optional } from '@nestjs/common';

import { BunnyConfig } from './bunny.config';
import { PrismaService } from '../../../prisma/prisma.service';
import { VideoProvider, VideoStatus } from '../../../generated/prisma/client';
import { embedUrl } from './bunny-signing';

export type EmbedTokenStatus =
  'enforced' | 'not-enforced' | 'unknown' | 'no-video' | 'not-configured';

export interface EmbedTokenCheckResult {
  status: EmbedTokenStatus;
  checkedAt: string | null;
}

type ProbeFetch = (url: string, init: RequestInit) => Promise<Response>;
type CacheEntry = { result: EmbedTokenCheckResult; expiresAt: number };

const MAX_RESPONSE_BYTES = 64 * 1024;

async function readBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < MAX_RESPONSE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = value.subarray(0, MAX_RESPONSE_BYTES - size);
      chunks.push(chunk);
      size += chunk.byteLength;
      if (size === MAX_RESPONSE_BYTES) await reader.cancel();
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export const BUNNY_EMBED_PROBE_FETCH = Symbol('BUNNY_EMBED_PROBE_FETCH');
export const BUNNY_EMBED_PROBE_CLOCK = Symbol('BUNNY_EMBED_PROBE_CLOCK');

@Injectable()
export class BunnyEmbedTokenCheck {
  private cache: CacheEntry | undefined;
  private readonly fetcher: ProbeFetch;
  private readonly now: () => number;

  constructor(
    @Inject(BunnyConfig) private readonly config: BunnyConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(BUNNY_EMBED_PROBE_FETCH) fetcher?: ProbeFetch,
    @Optional() @Inject(BUNNY_EMBED_PROBE_CLOCK) now?: () => number,
  ) {
    this.fetcher = fetcher ?? ((url, init) => fetch(url, init));
    this.now = now ?? Date.now;
  }

  async check(): Promise<EmbedTokenCheckResult> {
    const now = this.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.result;

    const settings = this.config.settings;
    if (!settings) return { status: 'not-configured', checkedAt: null };

    const asset = await this.prisma.videoAsset.findFirst({
      where: {
        provider: VideoProvider.BUNNY,
        status: VideoStatus.READY,
        bunnyVideoId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { bunnyVideoId: true },
    });
    if (!asset?.bunnyVideoId) {
      return { status: 'no-video', checkedAt: null };
    }

    const checkedAt = new Date(now).toISOString();
    let status: EmbedTokenStatus = 'unknown';
    try {
      const expires = Math.floor(now / 1000) + 300;
      const controlUrl = embedUrl({
        base: settings.embedBase,
        libraryId: settings.libraryId,
        videoId: asset.bunnyVideoId,
        tokenKey: settings.tokenKey,
        expires,
      });
      const control = await this.fetcher(controlUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      });
      const controlBody = await readBody(control);
      if (control.status !== 200 || !controlBody.includes(asset.bunnyVideoId)) {
        status = 'unknown';
      } else {
        const probeUrl = new URL(controlUrl);
        probeUrl.searchParams.set('token', '0'.repeat(64));
        const probe = await this.fetcher(probeUrl.toString(), {
          redirect: 'manual',
          signal: AbortSignal.timeout(5_000),
        });
        const probeBody = await readBody(probe);
        // Bunny can return HTTP 200 for both an authenticated player and an
        // HTML 404 page. Only a page containing this video GUID proves that
        // the player was served for the deliberately wrong token.
        if (probe.status === 200 && probeBody.includes(asset.bunnyVideoId)) {
          status = 'not-enforced';
        } else if (
          probe.status === 401 ||
          probe.status === 403 ||
          probe.status === 404 ||
          probe.status === 200
        ) {
          status = 'enforced';
        }
      }
    } catch {
      status = 'unknown';
    }
    const result = { status, checkedAt };
    this.cache = {
      result,
      expiresAt: now + (status === 'unknown' ? 60_000 : 600_000),
    };
    return result;
  }
}
