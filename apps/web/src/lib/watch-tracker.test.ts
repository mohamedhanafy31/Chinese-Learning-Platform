import { describe, expect, it } from 'vitest';

import {
  MAX_REPORT_SEGMENTS,
  WatchTracker,
  mergeSegments,
  resumePosition,
} from './watch-tracker';

/** Plays from `from` to `to` in `step`-second timeupdates. */
function play(tracker: WatchTracker, from: number, to: number, step = 0.25) {
  for (let time = from; time <= to + 1e-9; time += step) {
    tracker.tick(Math.round(time * 100) / 100);
  }
}

describe('WatchTracker', () => {
  it('records continuous playback as one range', () => {
    const tracker = new WatchTracker();
    play(tracker, 0, 10);
    tracker.pause(10);
    expect(tracker.take()).toEqual({ segments: [[0, 10]], positionSec: 10 });
  });

  it('does not count a seek forward as watched', () => {
    const tracker = new WatchTracker();
    play(tracker, 0, 5);
    tracker.seek();
    play(tracker, 60, 65);
    tracker.pause(65);
    expect(tracker.take().segments).toEqual([
      [0, 5],
      [60, 65],
    ]);
  });

  it('breaks the range on an unannounced jump (player.js has no seeking event)', () => {
    const tracker = new WatchTracker();
    play(tracker, 0, 4);
    tracker.tick(40);
    play(tracker, 40.25, 44);
    tracker.pause(44);
    expect(tracker.take().segments).toEqual([
      [0, 4],
      [40, 44],
    ]);
  });

  it('breaks the range on a backwards seek and merges a replay', () => {
    const tracker = new WatchTracker();
    play(tracker, 0, 10);
    tracker.seek();
    play(tracker, 5, 12);
    tracker.pause(12);
    expect(tracker.take().segments).toEqual([[0, 12]]);
  });

  it('accepts bigger steps at a faster playback rate', () => {
    const tracker = new WatchTracker();
    for (let time = 0; time <= 40; time += 4) tracker.tick(time, 16);
    tracker.pause(40);
    expect(tracker.take().segments).toEqual([[0, 40]]);
  });

  it('keeps an open range across flushes without gaps or overlaps', () => {
    const tracker = new WatchTracker();
    play(tracker, 0, 10);
    expect(tracker.take().segments).toEqual([[0, 10]]);
    play(tracker, 10.25, 20);
    expect(tracker.take().segments).toEqual([[10, 20]]);
    expect(tracker.take().segments).toEqual([]);
  });

  it('adds the tail on ended', () => {
    const tracker = new WatchTracker();
    play(tracker, 0, 9.5);
    tracker.ended(10);
    expect(tracker.take()).toEqual({ segments: [[0, 10]], positionSec: 10 });
  });

  it('ignores a pause far from the last tick and invalid times', () => {
    const tracker = new WatchTracker();
    play(tracker, 0, 3);
    tracker.tick(Number.NaN);
    tracker.tick(-1);
    tracker.pause(500);
    expect(tracker.take().segments).toEqual([[0, 3]]);
  });

  it('restores a failed report', () => {
    const tracker = new WatchTracker();
    play(tracker, 0, 5);
    tracker.pause(5);
    const report = tracker.take();
    expect(tracker.dirty).toBe(false);
    tracker.restore(report);
    expect(tracker.dirty).toBe(true);
    expect(tracker.take().segments).toEqual([[0, 5]]);
  });

  it('never reports more than the API accepts, keeping the longest ranges', () => {
    const tracker = new WatchTracker();
    for (let index = 0; index < 30; index += 1) {
      tracker.seek();
      play(tracker, index * 10, index * 10 + 1 + (index === 7 ? 4 : 0));
    }
    tracker.pause();
    const { segments } = tracker.take();
    expect(segments).toHaveLength(MAX_REPORT_SEGMENTS);
    expect(segments).toContainEqual([70, 75]);
  });

  it('rounds to one decimal', () => {
    const tracker = new WatchTracker();
    tracker.tick(0.04);
    tracker.tick(1.26);
    tracker.pause(1.26);
    expect(tracker.take().segments).toEqual([[0, 1.3]]);
  });
});

describe('mergeSegments', () => {
  it('merges touching and overlapping ranges and drops empty ones', () => {
    expect(
      mergeSegments([
        [5, 8],
        [0, 5],
        [7, 9],
        [20, 20],
      ]),
    ).toEqual([[0, 9]]);
  });
});

describe('resumePosition', () => {
  it.each([
    [0, 100, 0],
    [40, 100, 40],
    [94, 100, 94],
    [95, 100, 0],
    [99, 100, 0],
    [10, 0, 0],
    [10, Number.NaN, 0],
  ])('position %i of %i resumes at %i', (position, duration, expected) => {
    expect(resumePosition(position, duration)).toBe(expected);
  });
});
