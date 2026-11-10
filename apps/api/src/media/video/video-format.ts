export type DetectedVideoType = 'mp4' | 'webm';

export const VIDEO_MIME: Record<DetectedVideoType, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/** Bytes needed from the start of a file to identify it. */
export const VIDEO_SNIFF_BYTES = 12;

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];

/**
 * Identifies a video by its magic bytes: an MP4 `ftyp` box (bytes 4 to 8) or a
 * WebM/Matroska EBML header. File names and client MIME types are never used.
 */
export function detectVideoType(buffer: Buffer): DetectedVideoType | null {
  if (buffer.length >= 8 && buffer.toString('latin1', 4, 8) === 'ftyp') {
    return 'mp4';
  }
  if (
    buffer.length >= 4 &&
    EBML_MAGIC.every((byte, index) => buffer[index] === byte)
  ) {
    return 'webm';
  }
  return null;
}
