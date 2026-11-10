import {
  adminVideoSchema,
  pendingVideoSchema,
  VideoStatus,
  type AdminVideo,
  type PendingVideo,
} from '@app/shared';

import type { VideoAsset } from '../../generated/prisma/client';

export function toAdminVideo(row: VideoAsset): AdminVideo {
  return adminVideoSchema.parse({
    id: row.id,
    provider: row.provider,
    status: row.status,
    mime: row.mime,
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    durationSec: row.durationSec,
    originalName: row.originalName,
    createdAt: row.createdAt.toISOString(),
  });
}

/**
 * The newest upload that is still uploading, processing or failed, but only
 * when it is newer than the active video (an older one can never replace it).
 */
export function toPendingVideo(
  rows: readonly VideoAsset[],
  active: VideoAsset | null,
): PendingVideo | null {
  const pending = rows
    .filter(
      (row) =>
        row.status !== VideoStatus.READY &&
        row.id !== active?.id &&
        (!active || row.createdAt.getTime() > active.createdAt.getTime()),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!pending) return null;
  return pendingVideoSchema.parse({
    id: pending.id,
    status: pending.status,
    ...(pending.failureReason ? { failureReason: pending.failureReason } : {}),
    createdAt: pending.createdAt.toISOString(),
  });
}
