/**
 * Tracks which seconds of a video were actually played, for progress reports.
 * Only continuous playback counts: a seek closes the open range, and a jump in
 * `timeupdate` larger than a playback step (a seek the player did not announce,
 * as in Bunny's player) is treated as one. Pure, so it can be unit-tested
 * without a media element.
 */

export type WatchSegment = [from: number, to: number];

/** The server accepts at most this many ranges per report. */
export const MAX_REPORT_SEGMENTS = 20;

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Merges overlapping or touching ranges, sorted. */
export function mergeSegments(
  segments: readonly WatchSegment[],
): WatchSegment[] {
  const sorted = segments
    .filter(([from, to]) => to > from)
    .map(([from, to]) => [from, to] as WatchSegment)
    .sort((a, b) => a[0] - b[0]);
  const merged: WatchSegment[] = [];
  for (const [from, to] of sorted) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

export interface WatchReport {
  segments: WatchSegment[];
  positionSec: number;
}

export class WatchTracker {
  private pending: WatchSegment[] = [];
  private start: number | null = null;
  private last: number | null = null;
  private position = 0;

  /**
   * `time` is the media clock, `rate` the playback rate. Call it from
   * `timeupdate` while the video is playing.
   */
  tick(time: number, rate = 1): void {
    if (!Number.isFinite(time) || time < 0) return;
    this.position = time;
    const maxStep = Math.max(2, rate * 1.5);
    if (this.last === null || this.start === null) {
      this.start = time;
    } else {
      const step = time - this.last;
      if (step < 0 || step > maxStep) {
        this.close();
        this.start = time;
      }
    }
    this.last = time;
  }

  /** A seek began: what was played so far is kept, the jump is not counted. */
  seek(): void {
    this.close();
  }

  /** Playback stopped (pause, buffering, hidden tab). */
  pause(time?: number): void {
    if (time !== undefined && this.last !== null && time >= this.last) {
      if (time - this.last <= 2) this.last = time;
    }
    this.close();
  }

  /** The video reached its end: the tail up to `duration` was played. */
  ended(duration: number): void {
    if (Number.isFinite(duration) && this.last !== null) {
      if (duration >= this.last && duration - this.last <= 2) {
        this.last = duration;
      }
      this.position = duration;
    }
    this.close();
  }

  /** Whether there is anything new to report. */
  get dirty(): boolean {
    return (
      this.pending.length > 0 ||
      (this.start !== null && this.last !== null && this.last > this.start)
    );
  }

  /**
   * Takes what has been played since the last call, ready to send. A range
   * still being played stays open (it continues from where it was cut).
   */
  take(): WatchReport {
    const open = this.start !== null && this.last !== null ? this.last : null;
    this.close();
    if (open !== null) {
      this.start = open;
      this.last = open;
    }
    const segments = mergeSegments(this.pending)
      .map(([from, to]): WatchSegment => [round1(from), round1(to)])
      .filter(([from, to]) => to > from)
      .sort((a, b) => b[1] - b[0] - (a[1] - a[0]))
      .slice(0, MAX_REPORT_SEGMENTS)
      .sort((a, b) => a[0] - b[0]);
    this.pending = [];
    return { segments, positionSec: Math.max(0, Math.floor(this.position)) };
  }

  /** Puts a report back after a failed send, so nothing is lost. */
  restore(report: WatchReport): void {
    this.pending = mergeSegments([...this.pending, ...report.segments]);
  }

  private close(): void {
    if (this.start !== null && this.last !== null && this.last > this.start) {
      this.pending = mergeSegments([...this.pending, [this.start, this.last]]);
    }
    this.start = null;
    this.last = null;
  }
}

/** Where to resume: the saved position, unless the lesson is nearly over. */
export function resumePosition(
  lastPositionSec: number,
  duration: number,
): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (lastPositionSec <= 0 || lastPositionSec >= duration * 0.95) return 0;
  return lastPositionSec;
}
