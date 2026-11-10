import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline, type Readable } from 'node:stream';

import { DEFAULT_VIDEO_MAX_BYTES } from '@app/shared';

/**
 * Where and how large local video uploads may be. Multer options are static
 * (they are fixed when the interceptor class is created), so the module fills
 * this in at boot, before the first request, from the validated config.
 */
export const localUploadTarget = {
  dir: '',
  maxBytes: DEFAULT_VIDEO_MAX_BYTES,
};

/** The file Multer hands the controller once the engine has stored it. */
export interface StoredVideoUpload {
  path: string;
  size: number;
  originalname: string;
}

type Done = (
  error: Error | null,
  info?: { path: string; size: number },
) => void;

/**
 * A Multer storage engine that streams the upload straight to a temp file in
 * the private videos directory, so a multi-gigabyte upload is never held in
 * memory. The temp name starts with a dot and ends in `.tmp`; the service
 * renames it to `<assetId>.<ext>` only after the magic bytes check passes.
 */
export class LocalVideoStorage {
  _handleFile(_request: unknown, file: { stream: Readable }, done: Done): void {
    const target = path.join(
      localUploadTarget.dir,
      `.upload-${randomUUID()}.tmp`,
    );
    const output = createWriteStream(target, { flags: 'wx' });
    // `pipeline` applies backpressure and destroys both streams on failure.
    pipeline(file.stream, output, (error) => {
      if (error) {
        void unlink(target)
          .catch(() => undefined)
          .finally(() => done(error));
        return;
      }
      done(null, { path: target, size: output.bytesWritten });
    });
  }

  _removeFile(
    _request: unknown,
    file: { path?: string },
    done: (error: Error | null) => void,
  ): void {
    if (!file.path) return done(null);
    unlink(file.path).then(
      () => done(null),
      (error: NodeJS.ErrnoException) =>
        done(error.code === 'ENOENT' ? null : error),
    );
  }
}
