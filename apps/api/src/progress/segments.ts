/**
 * Pure range arithmetic for watch coverage. A range is `[from, to]` in seconds
 * with one decimal at most; every function returns sorted, merged, rounded
 * ranges so callers can compare and store them as they are.
 */

export type Range = readonly [from: number, to: number];

/** Rounds to one decimal, the resolution progress is tracked at. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Sorts and merges overlapping or touching ranges; drops empty or invalid ones. */
export function mergeRanges(ranges: readonly Range[]): Range[] {
  const sorted = ranges
    .map(([from, to]) => [round1(from), round1(to)] as const)
    .filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to))
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const [from, to] of sorted) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

export function unionRanges(a: readonly Range[], b: readonly Range[]): Range[] {
  return mergeRanges([...a, ...b]);
}

/** Total seconds covered by the ranges (overlaps counted once). */
export function coverage(ranges: readonly Range[]): number {
  return round1(
    mergeRanges(ranges).reduce((sum, [from, to]) => sum + (to - from), 0),
  );
}

/** Keeps only the part of each range inside `[0, duration]`. */
export function clampRanges(
  ranges: readonly Range[],
  duration: number,
): Range[] {
  return mergeRanges(
    ranges.map(([from, to]) => [Math.max(0, from), Math.min(duration, to)]),
  );
}

/** The parts of `ranges` that `covered` does not already contain. */
export function subtractRanges(
  ranges: readonly Range[],
  covered: readonly Range[],
): Range[] {
  const existing = mergeRanges(covered);
  const result: [number, number][] = [];
  for (const [rangeFrom, to] of mergeRanges(ranges)) {
    let from = rangeFrom;
    for (const [coveredFrom, coveredTo] of existing) {
      if (coveredTo <= from) continue;
      if (coveredFrom >= to) break;
      if (coveredFrom > from) result.push([from, coveredFrom]);
      from = Math.max(from, coveredTo);
      if (from >= to) break;
    }
    if (from < to) result.push([from, to]);
  }
  return mergeRanges(result);
}

/**
 * Keeps at most `budget` seconds of the ranges, front to back, cutting the
 * range that crosses the limit. This is the anti-cheat clamp: a report may not
 * add more coverage than the time it could really have taken to watch.
 */
export function limitCoverage(
  ranges: readonly Range[],
  budget: number,
): Range[] {
  let left = Math.max(0, round1(budget));
  const kept: [number, number][] = [];
  for (const [from, to] of mergeRanges(ranges)) {
    if (left <= 0) break;
    const length = round1(to - from);
    if (length <= left) {
      kept.push([from, to]);
      left = round1(left - length);
    } else {
      kept.push([from, round1(from + left)]);
      left = 0;
    }
  }
  return kept;
}

/**
 * Bounds how many ranges are stored. A learner cannot honestly produce more
 * than a handful of disjoint ranges, so the shortest ones are dropped rather
 * than gaps being filled (which would invent coverage).
 */
export function capRanges(ranges: readonly Range[], max: number): Range[] {
  const merged = mergeRanges(ranges);
  if (merged.length <= max) return merged;
  const keep = new Set(
    [...merged]
      .sort((a, b) => b[1] - b[0] - (a[1] - a[0]) || a[0] - b[0])
      .slice(0, max),
  );
  return merged.filter((range) => keep.has(range));
}

/** Reads stored JSON back into ranges, ignoring anything malformed. */
export function parseRanges(value: unknown): Range[] {
  if (!Array.isArray(value)) return [];
  const ranges: Range[] = [];
  for (const entry of value as unknown[]) {
    if (
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === 'number' &&
      typeof entry[1] === 'number'
    ) {
      ranges.push([entry[0], entry[1]]);
    }
  }
  return mergeRanges(ranges);
}

/** The first report may add this many seconds of new coverage. */
export const FIRST_REPORT_SECONDS = 30;
/** Slack added to the wall-clock time since the last report. */
export const REPORT_SLACK_SECONDS = 15;
/**
 * Overall ceiling: a learner can never have more coverage than twice the
 * real time since their first report (plus the first-report allowance). The
 * per-report budget alone would let a client spam reports and claim 15 s on
 * each; this bounds the whole lesson to at most 2x playback speed.
 */
export const MAX_PLAYBACK_RATE = 2;
/** The most disjoint ranges kept per learner and lesson. */
export const MAX_STORED_SEGMENTS = 200;

/**
 * Applies one progress report to the stored coverage. New coverage is capped at
 * the seconds since the previous report plus 15 (30 for the first report), so a
 * client cannot claim a whole video in one request; ranges already watched add
 * nothing; everything is clamped to `[0, duration]`.
 */
export function applyReport({
  stored,
  reported,
  duration,
  sinceLastReportSec,
  sinceFirstReportSec = null,
}: {
  stored: readonly Range[];
  reported: readonly Range[];
  duration: number;
  /** Seconds since the last report, or null for the first one. */
  sinceLastReportSec: number | null;
  /** Seconds since the learner's first report on this lesson, if known. */
  sinceFirstReportSec?: number | null;
}): Range[] {
  const known = clampRanges(stored, duration);
  const fresh = subtractRanges(clampRanges(reported, duration), known);
  const budget =
    sinceLastReportSec === null
      ? FIRST_REPORT_SECONDS
      : Math.min(duration, Math.max(0, sinceLastReportSec)) +
        REPORT_SLACK_SECONDS;
  const ceiling =
    sinceFirstReportSec === null
      ? Number.POSITIVE_INFINITY
      : FIRST_REPORT_SECONDS +
        MAX_PLAYBACK_RATE * Math.max(0, sinceFirstReportSec) -
        coverage(known);
  const allowed = Math.max(0, Math.min(budget, ceiling));
  return capRanges(
    unionRanges(known, limitCoverage(fresh, round1(allowed))),
    MAX_STORED_SEGMENTS,
  );
}
