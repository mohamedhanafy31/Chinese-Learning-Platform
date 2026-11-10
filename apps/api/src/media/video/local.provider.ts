import { randomUUID } from 'node:crypto';
import { open, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

import {
  Inject,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import { VIDEO_MIME, VIDEO_SNIFF_BYTES, detectVideoType } from './video-format';
import type {
  FinalizeUploadInput,
  FinalizedUpload,
  PlaybackDescriptor,
  UploadTicket,
  VideoAssetRef,
  VideoProvider,
} from './video-provider';
import { MediaStorage } from '../media-storage';

export function streamUrl(assetId: string): string {
  return `/api/v1/videos/${assetId}/stream`;
}

/** Reads the first bytes of a file without loading the rest. */
export async function readFileHead(file: string): Promise<Buffer> {
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(VIDEO_SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, VIDEO_SNIFF_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Development-only provider: videos live in `UPLOADS_DIR/videos` and are
 * streamed by the access-checked stream route, never served statically.
 */
@Injectable()
export class LocalProvider implements VideoProvider {
  readonly kind = 'LOCAL' as const;

  constructor(@Inject(MediaStorage) private readonly storage: MediaStorage) {}

  createUpload(): UploadTicket {
    return { assetId: randomUUID(), provider: this.kind };
  }

  /** Verifies the magic bytes, then renames the temp file to its final key. */
  async finalize({
    assetId,
    tempPath,
  }: FinalizeUploadInput): Promise<FinalizedUpload> {
    const type = detectVideoType(await readFileHead(tempPath));
    if (!type) {
      throw new UnsupportedMediaTypeException(
        'Only MP4 and WebM videos are accepted',
      );
    }
    const localKey = `${assetId}.${type}`;
    const { size } = await stat(tempPath);
    await rename(tempPath, this.pathFor(localKey));
    return { localKey, mime: VIDEO_MIME[type], sizeBytes: size };
  }

  playback(asset: VideoAssetRef): PlaybackDescriptor {
    return {
      provider: this.kind,
      src: streamUrl(asset.id),
      mime: asset.mime,
    };
  }

  async delete(asset: VideoAssetRef): Promise<void> {
    if (!asset.localKey) return;
    await unlink(this.pathFor(asset.localKey)).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
  }

  /** Absolute path of a stored video; keys never contain separators. */
  pathFor(localKey: string): string {
    return path.join(this.storage.videosDir, path.basename(localKey));
  }
}
