import { adminVideoSchema, type AdminVideo } from '@app/shared';

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
