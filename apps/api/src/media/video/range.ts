/**
 * HTTP Range parsing for the video stream. Pure and table-tested.
 *
 * Only a single `bytes=` range is honoured. A header that is malformed, uses
 * another unit or asks for several ranges is ignored (the caller then sends
 * the whole file with 200), which RFC 9110 allows. A well-formed range that
 * cannot be satisfied yields `unsatisfiable` (416).
 */
export type RangeResult =
  | { kind: 'full' }
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'unsatisfiable' };

const SINGLE_RANGE = /^bytes\s*=\s*(\d*)\s*-\s*(\d*)$/i;

export function parseRange(
  header: string | undefined,
  size: number,
): RangeResult {
  if (header === undefined) return { kind: 'full' };
  const match = SINGLE_RANGE.exec(header.trim());
  if (!match) return { kind: 'full' };
  const [, first = '', last = ''] = match;
  if (first === '' && last === '') return { kind: 'full' };

  // BigInt keeps absurdly long digit strings exact instead of rounding them.
  const length = BigInt(size);

  if (first === '') {
    // Suffix range: the final N bytes. N = 0 selects nothing.
    const suffix = BigInt(last);
    if (suffix === 0n || length === 0n) return { kind: 'unsatisfiable' };
    const start = suffix >= length ? 0n : length - suffix;
    return { kind: 'partial', start: Number(start), end: size - 1 };
  }

  const start = BigInt(first);
  if (start >= length) return { kind: 'unsatisfiable' };
  if (last === '')
    return { kind: 'partial', start: Number(start), end: size - 1 };
  const end = BigInt(last);
  if (start > end) return { kind: 'unsatisfiable' };
  return {
    kind: 'partial',
    start: Number(start),
    end: Number(end >= length ? length - 1n : end),
  };
}
