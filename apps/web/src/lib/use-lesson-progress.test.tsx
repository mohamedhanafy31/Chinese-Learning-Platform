import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetApiClientForTests } from '@/lib/api-client';

import { FLUSH_INTERVAL_MS, useLessonProgress } from './use-lesson-progress';

const lessonId = '00000000-0000-4000-8000-0000000000cc';

const answer = {
  watchedPercent: 40,
  videoComplete: false,
  complete: false,
  nextLessonId: null,
};

function respond(status = 200): Response {
  return new Response(status === 200 ? JSON.stringify(answer) : '{}', {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function bodies(): { segments: number[][]; positionSec: number }[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(
      ([, init]) => JSON.parse(String((init as RequestInit).body)) as never,
    );
}

describe('useLessonProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(respond())),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetApiClientForTests();
  });

  function play(controller: ReturnType<typeof useLessonProgress>, to: number) {
    controller.play();
    for (let time = 0; time <= to; time += 0.5) controller.tick(time);
  }

  it('posts the played ranges to the lesson’s progress endpoint on pause', async () => {
    const onResult = vi.fn();
    const { result } = renderHook(() =>
      useLessonProgress({ lessonId, enabled: true, onResult }),
    );
    result.current.setDuration(61.4);
    play(result.current, 8);
    await act(async () => {
      result.current.pause(8);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/lessons/${lessonId}/progress`);
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(bodies()[0]).toEqual({
      segments: [[0, 8]],
      positionSec: 8,
      durationSec: 61,
    });
    expect(onResult).toHaveBeenCalledWith(answer);
  });

  it('flushes every 10 seconds while playing, and stops when paused', async () => {
    const { result } = renderHook(() =>
      useLessonProgress({ lessonId, enabled: true }),
    );
    play(result.current, 5);
    await act(() => vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS));
    expect(fetch).toHaveBeenCalledTimes(1);
    for (let time = 5.5; time <= 15; time += 0.5) result.current.tick(time);
    await act(() => vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(bodies()[1]?.segments).toEqual([[5, 15]]);
    await act(async () => {
      result.current.pause(15);
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(() => vi.advanceTimersByTimeAsync(3 * FLUSH_INTERVAL_MS));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not send anything when there is nothing new', async () => {
    const { result } = renderHook(() =>
      useLessonProgress({ lessonId, enabled: true }),
    );
    await act(async () => {
      await result.current.flush(true);
    });
    // The very first flush still reports the position (0) once.
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.flush(true);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('puts a report back after a server error and sends it next time', async () => {
    vi.mocked(fetch).mockImplementationOnce(() =>
      Promise.resolve(respond(503)),
    );
    const { result } = renderHook(() =>
      useLessonProgress({ lessonId, enabled: true }),
    );
    play(result.current, 4);
    await act(async () => {
      result.current.pause(4);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(bodies()[0]?.segments).toEqual([[0, 4]]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await result.current.flush(true);
    });
    expect(bodies()[1]?.segments).toEqual([[0, 4]]);
  });

  it('flushes when the tab is hidden', async () => {
    const { result } = renderHook(() =>
      useLessonProgress({ lessonId, enabled: true }),
    );
    play(result.current, 3);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(bodies()[0]?.segments).toEqual([[0, 3]]);
  });

  it('sends nothing for anonymous viewers', async () => {
    const { result } = renderHook(() =>
      useLessonProgress({ lessonId, enabled: false }),
    );
    play(result.current, 5);
    await act(async () => {
      result.current.pause(5);
      result.current.ended(5);
      await vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS * 2);
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
