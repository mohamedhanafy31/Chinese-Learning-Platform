import { unlink } from 'node:fs/promises';
import path from 'node:path';

import { Logger } from '@nestjs/common';

const logger = new Logger('VideoFiles');

/** Best-effort removal of a stored video; failures are logged, never thrown. */
export async function removeVideoFile(
  videosDir: string,
  localKey: string | null,
): Promise<void> {
  if (!localKey) return;
  try {
    await unlink(path.join(videosDir, path.basename(localKey)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    logger.error(
      `Could not delete video file ${localKey}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
