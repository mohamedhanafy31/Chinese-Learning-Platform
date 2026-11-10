import { describe, expect, it } from '@jest/globals';

import { parseRange, type RangeResult } from './range';

const full: RangeResult = { kind: 'full' };
const none: RangeResult = { kind: 'unsatisfiable' };
const part = (start: number, end: number): RangeResult => ({
  kind: 'partial',
  start,
  end,
});

describe('parseRange (size 1000)', () => {
  it.each<[string, string | undefined, RangeResult]>([
    ['no header', undefined, full],
    ['empty header', '', full],
    ['closed range', 'bytes=0-499', part(0, 499)],
    ['open-ended range', 'bytes=500-', part(500, 999)],
    ['suffix range', 'bytes=-200', part(800, 999)],
    ['single first byte', 'bytes=0-0', part(0, 0)],
    ['single last byte', 'bytes=999-999', part(999, 999)],
    ['last byte via open end', 'bytes=999-', part(999, 999)],
    ['last byte via suffix', 'bytes=-1', part(999, 999)],
    ['end clamped to the size', 'bytes=900-5000', part(900, 999)],
    ['whole file', 'bytes=0-999', part(0, 999)],
    ['suffix larger than the file', 'bytes=-5000', part(0, 999)],
    ['surrounding whitespace', '  bytes=10-20  ', part(10, 20)],
    ['whitespace around the parts', 'bytes = 10 - 20', part(10, 20)],
    ['unit in capitals', 'BYTES=10-20', part(10, 20)],
    ['huge end is clamped', 'bytes=0-99999999999999999999999', part(0, 999)],
    [
      'huge suffix is the whole file',
      'bytes=-99999999999999999999999',
      part(0, 999),
    ],
    ['start at the size', 'bytes=1000-', none],
    ['start beyond the size', 'bytes=1500-1600', none],
    ['huge start', 'bytes=99999999999999999999999-', none],
    ['start after end', 'bytes=500-100', none],
    ['zero-length suffix', 'bytes=-0', none],
    ['multiple ranges are ignored', 'bytes=0-1,5-9', full],
    ['other units are ignored', 'items=0-5', full],
    ['no unit is ignored', '0-5', full],
    ['neither bound is ignored', 'bytes=-', full],
    ['letters are ignored', 'bytes=a-b', full],
    ['negative start is ignored', 'bytes=--5', full],
    ['trailing junk is ignored', 'bytes=0-5x', full],
    ['decimal is ignored', 'bytes=0.5-3', full],
  ])('%s: %s', (_name, header, expected) => {
    expect(parseRange(header, 1000)).toEqual(expected);
  });

  it('treats every range of an empty file as unsatisfiable', () => {
    expect(parseRange('bytes=0-0', 0)).toEqual(none);
    expect(parseRange('bytes=-5', 0)).toEqual(none);
    expect(parseRange('bytes=0-', 0)).toEqual(none);
    expect(parseRange(undefined, 0)).toEqual(full);
  });
});
