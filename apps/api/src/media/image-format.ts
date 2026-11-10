export type DetectedImageType = 'jpeg' | 'png' | 'webp';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/**
 * Identifies an image by its magic bytes. File names and client-declared MIME
 * types are never consulted.
 */
export function detectImageType(buffer: Buffer): DetectedImageType | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buffer, PNG_SIGNATURE)) return 'png';
  if (
    buffer.length >= 12 &&
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}
