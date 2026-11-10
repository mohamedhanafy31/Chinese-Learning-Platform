import { createHash } from 'node:crypto';

import { VideoStatus } from '@app/shared';

/** A TUS upload signature stays valid for six hours. */
export const TUS_SIGNATURE_TTL_SEC = 6 * 60 * 60;

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Unix seconds a TUS signature issued at `nowMs` expires. */
export function tusExpiry(nowMs: number): number {
  return Math.floor(nowMs / 1000) + TUS_SIGNATURE_TTL_SEC;
}

/**
 * Bunny's presigned TUS signature: `sha256_hex(libraryId + apiKey + expire +
 * videoId)`. The browser receives this digest, never the API key.
 */
export function tusSignature(input: {
  libraryId: string;
  apiKey: string;
  expire: number;
  videoId: string;
}): string {
  return sha256Hex(
    `${input.libraryId}${input.apiKey}${input.expire}${input.videoId}`,
  );
}

/** Token authentication for the embed player: `sha256_hex(key + id + expires)`. */
export function embedToken(input: {
  tokenKey: string;
  videoId: string;
  expires: number;
}): string {
  return sha256Hex(`${input.tokenKey}${input.videoId}${input.expires}`);
}

export function embedUrl(input: {
  base: string;
  libraryId: string;
  videoId: string;
  tokenKey: string;
  expires: number;
}): string {
  const token = embedToken(input);
  const base = input.base.replace(/\/+$/, '');
  return (
    `${base}/embed/${encodeURIComponent(input.libraryId)}/${encodeURIComponent(input.videoId)}` +
    `?token=${token}&expires=${input.expires}&autoplay=false&preload=true&responsive=true`
  );
}

/**
 * Bunny uses two different numeric enums (docs, checked 2026-11-10):
 * the webhook `Status` and the video object's `status` from `getVideo`. The
 * webhook is only a hint; the asset follows the fetched video status.
 *
 * Webhook: 0 queued, 1 processing, 2 encoding, 6/7 presigned upload
 * started/finished -> PROCESSING; 3 finished, 4 resolution finished -> READY;
 * 5 failed, 8 presigned upload failed -> FAILED; 9+ (captions, titles,
 * chapters, deletions, ...) and unknown -> ignored.
 */
export function mapWebhookStatus(status: number): VideoStatus | null {
  switch (status) {
    case 0:
    case 1:
    case 2:
    case 6:
    case 7:
      return VideoStatus.PROCESSING;
    case 3:
    case 4:
      return VideoStatus.READY;
    case 5:
    case 8:
      return VideoStatus.FAILED;
    default:
      return null;
  }
}

/**
 * Video object `status`: 0 created (nothing uploaded yet) -> leave as is;
 * 1 uploaded, 2 processing, 3 transcoding, 7 JIT segmenting, 8 JIT playlists
 * created -> PROCESSING; 4 finished -> READY; 5 error, 6 upload failed ->
 * FAILED; unknown -> ignored.
 */
export function mapVideoStatus(status: number): VideoStatus | null {
  switch (status) {
    case 1:
    case 2:
    case 3:
    case 7:
    case 8:
      return VideoStatus.PROCESSING;
    case 4:
      return VideoStatus.READY;
    case 5:
    case 6:
      return VideoStatus.FAILED;
    default:
      return null;
  }
}

/** A short, secret-free reason for a FAILED asset, from the video status. */
export function failureReasonFor(videoStatus: number): string {
  return videoStatus === 6 ? 'upload-failed' : 'encoding-failed';
}
