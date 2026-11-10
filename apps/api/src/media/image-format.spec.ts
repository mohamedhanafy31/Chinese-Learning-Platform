import { describe, expect, it } from '@jest/globals';

import { detectImageType } from './image-format';

describe('detectImageType', () => {
  it('recognises JPEG, PNG and WebP by magic bytes', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe(
      'jpeg',
    );
    expect(
      detectImageType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
      ),
    ).toBe('png');
    expect(
      detectImageType(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')),
    ).toBe('webp');
  });

  it('rejects text, other formats and short buffers', () => {
    expect(detectImageType(Buffer.from('not an image'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a......'))).toBeNull();
    expect(
      detectImageType(Buffer.from('RIFF\u0000\u0000\u0000\u0000WAVEfmt ')),
    ).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
