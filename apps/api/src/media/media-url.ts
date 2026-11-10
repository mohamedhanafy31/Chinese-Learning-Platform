import type { ImageRef } from '@app/shared';

export function mediaUrl(storageKey: string): string {
  return `/media/${storageKey}`;
}

interface ImageRow {
  storageKey: string;
  width: number;
  height: number;
}

/** Public/admin shape of an attached image; the storage key stays internal. */
export function toImageRef(row: ImageRow | null | undefined): ImageRef | null {
  return row
    ? { url: mediaUrl(row.storageKey), width: row.width, height: row.height }
    : null;
}
