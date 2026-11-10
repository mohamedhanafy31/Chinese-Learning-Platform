import { describe, expect, it } from '@jest/globals';

import { detectVideoType } from './video-format';

describe('detectVideoType', () => {
  it('recognises an MP4 by its ftyp box', () => {
    const header = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x20]),
      Buffer.from('ftypisom'),
    ]);
    expect(detectVideoType(header)).toBe('mp4');
  });

  it('recognises WebM and Matroska by the EBML header', () => {
    expect(detectVideoType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f]))).toBe(
      'webm',
    );
  });

  it('rejects text, images, other containers and short buffers', () => {
    expect(detectVideoType(Buffer.from('plain text, not a video'))).toBeNull();
    expect(
      detectVideoType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0])),
    ).toBeNull();
    // An AVI is RIFF, never an MP4 or WebM.
    expect(
      detectVideoType(Buffer.from('RIFF\u0000\u0000\u0000\u0000AVI ')),
    ).toBeNull();
    expect(detectVideoType(Buffer.from('ftyp'))).toBeNull();
    expect(detectVideoType(Buffer.from([0x1a, 0x45, 0xdf]))).toBeNull();
    expect(detectVideoType(Buffer.alloc(0))).toBeNull();
  });

  it('ignores a ftyp that is not at offset 4', () => {
    expect(detectVideoType(Buffer.from('ftypisomxxxx'))).toBeNull();
  });
});
