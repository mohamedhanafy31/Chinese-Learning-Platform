import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PendingVideo } from '@app/shared';

import { PENDING_POLL_MS, usePendingVideo } from './use-pending-video';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch }));

const LESSON_ID = '3f2b8c1e-6d1a-4a53-9c1d-2f2d7a9b0c11';
const ASSET_ID = '7a1c4a8e-1d0f-4c36-8d7b-0a5b7c9d2e44';

const pending = (status: PendingVideo['status'], failureReason?: string) =>
  ({
    id: ASSET_ID,
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...(failureReason ? { failureReason } : {}),
  }) satisfies PendingVideo;

const lesson = (overrides: Record<string, unknown>) => ({
  ok: true,
  data: {
    id: LESSON_ID,
    levelId: LESSON_ID,
    title: { en: 'Lesson' },
    description: null,
    hanzi: null,
    sortOrder: 1,
    isPublished: false,
    isFreePreview: false,
    thumbnailId: null,
    thumbnail: null,
    video: null,
    pendingVideo: null,
    firstPublishedAt: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  },
});

describe('usePendingVideo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiFetch.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls every five seconds while processing and stops once READY', async () => {
    const onReady = vi.fn();
    apiFetch
      .mockResolvedValueOnce(lesson({ pendingVideo: pending('PROCESSING') }))
      .mockResolvedValueOnce(
        lesson({
          video: {
            id: ASSET_ID,
            provider: 'BUNNY',
            status: 'READY',
            mime: 'video/mp4',
            sizeBytes: null,
            durationSec: 42,
            originalName: 'a.mp4',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          pendingVideo: null,
        }),
      );
    const { result } = renderHook(() =>
      usePendingVideo({
        lessonId: LESSON_ID,
        video: null,
        pending: pending('PROCESSING'),
        onReady,
      }),
    );

    expect(PENDING_POLL_MS).toBe(5000);
    expect(apiFetch).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(4999));
    expect(apiFetch).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(`/api/v1/admin/lessons/${LESSON_ID}`);
    expect(result.current.pending?.status).toBe('PROCESSING');
    expect(onReady).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.pending).toBeNull();
    expect(result.current.video?.status).toBe('READY');
    expect(onReady).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('stops on FAILED and exposes the reason', async () => {
    apiFetch.mockResolvedValueOnce(
      lesson({ pendingVideo: pending('FAILED', 'encoding-failed') }),
    );
    const { result } = renderHook(() =>
      usePendingVideo({
        lessonId: LESSON_ID,
        video: null,
        pending: pending('PROCESSING'),
      }),
    );
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.pending).toMatchObject({
      status: 'FAILED',
      failureReason: 'encoding-failed',
    });
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('stops polling when unmounted', async () => {
    apiFetch.mockResolvedValue(lesson({ pendingVideo: pending('PROCESSING') }));
    const { unmount } = renderHook(() =>
      usePendingVideo({
        lessonId: LESSON_ID,
        video: null,
        pending: pending('PROCESSING'),
      }),
    );
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('never polls without an in-flight upload', async () => {
    renderHook(() =>
      usePendingVideo({
        lessonId: LESSON_ID,
        video: null,
        pending: pending('FAILED', 'upload-failed'),
      }),
    );
    renderHook(() =>
      usePendingVideo({ lessonId: LESSON_ID, video: null, pending: null }),
    );
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('keeps its last state when a poll fails, and tries again', async () => {
    apiFetch
      .mockResolvedValueOnce({ ok: false, kind: 'error', status: 500 })
      .mockResolvedValueOnce(lesson({ pendingVideo: pending('PROCESSING') }));
    const { result } = renderHook(() =>
      usePendingVideo({
        lessonId: LESSON_ID,
        video: null,
        pending: pending('PROCESSING'),
      }),
    );
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.pending?.status).toBe('PROCESSING');
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
