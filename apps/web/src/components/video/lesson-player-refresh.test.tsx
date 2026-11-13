import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LessonPlayer } from './lesson-player';

const { apiFetchMock, routerRefreshMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  routerRefreshMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: apiFetchMock,
  apiFetchParsed: (path: string) => apiFetchMock(path),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}));
vi.mock('next/script', async () => {
  const react = await import('react');
  return {
    default: ({ onReady }: { src: string; onReady?: () => void }) => {
      react.useEffect(() => onReady?.(), [onReady]);
      return react.createElement('span');
    },
  };
});

describe('LessonPlayer Bunny link refresh', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    delete window.playerjs;
  });

  it('refreshes early, waits for pause, swaps the iframe, and restores position', async () => {
    const now = Date.parse('2026-11-13T00:00:00Z');
    vi.useFakeTimers({ now });
    const handlers: Record<string, (data?: unknown) => void> = {};
    const player = {
      on: (event: string, callback: (data?: unknown) => void) => {
        handlers[event] = callback;
      },
      getDuration: (callback: (seconds: number) => void) => callback(120),
      getCurrentTime: (callback: (seconds: number) => void) => callback(41),
      setCurrentTime: vi.fn(),
      off: vi.fn(() => {
        throw new TypeError(
          "Cannot read properties of null (reading 'postMessage')",
        );
      }),
    };
    window.playerjs = {
      Player: function Player() {
        return player;
      } as unknown as NonNullable<typeof window.playerjs>['Player'],
    };
    apiFetchMock.mockResolvedValue({
      ok: true,
      data: {
        video: {
          provider: 'BUNNY',
          embedUrl: 'https://iframe.mediadelivery.net/embed/1/id?token=new',
          expiresAt: new Date(now + 900_000).toISOString(),
        },
      },
      response: Response.json({}),
    });

    render(
      <LessonPlayer
        lessonId="lesson-id"
        label="Lesson"
        poster={null}
        unsupported="No support"
        video={{
          provider: 'BUNNY',
          embedUrl: 'https://iframe.mediadelivery.net/embed/1/id?token=old',
          expiresAt: new Date(now + 65_000).toISOString(),
          durationSec: 120,
        }}
      />,
    );
    expect(screen.getByTestId('lesson-embed')).toHaveAttribute(
      'src',
      'https://iframe.mediadelivery.net/embed/1/id?token=old',
    );

    act(() => handlers.ready?.());
    act(() => handlers.play?.());
    act(() => vi.advanceTimersByTime(5_000));
    await act(async () => Promise.resolve());
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/v1/lessons/lesson-id/playback',
    );
    expect(screen.getByTestId('lesson-embed')).toHaveAttribute(
      'src',
      'https://iframe.mediadelivery.net/embed/1/id?token=old',
    );

    expect(() => act(() => handlers.pause?.())).not.toThrow();
    expect(screen.getByTestId('lesson-embed')).toHaveAttribute(
      'src',
      'https://iframe.mediadelivery.net/embed/1/id?token=new',
    );
    act(() => handlers.ready?.());
    expect(player.setCurrentTime).toHaveBeenCalledWith(41);
  });

  it('unmounts after player attachment when player.js cannot detach listeners', () => {
    const handlers: Record<string, (data?: unknown) => void> = {};
    const player = {
      on: (event: string, callback: (data?: unknown) => void) => {
        handlers[event] = callback;
      },
      off: vi.fn(() => {
        throw new TypeError(
          "Cannot read properties of null (reading 'postMessage')",
        );
      }),
      getDuration: (callback: (seconds: number) => void) => callback(120),
      getCurrentTime: (callback: (seconds: number) => void) => callback(41),
      setCurrentTime: vi.fn(),
    };
    window.playerjs = {
      Player: function Player() {
        return player;
      } as unknown as NonNullable<typeof window.playerjs>['Player'],
    };

    const view = render(
      <LessonPlayer
        lessonId="lesson-id"
        label="Lesson"
        poster={null}
        unsupported="No support"
        video={{
          provider: 'BUNNY',
          embedUrl: 'https://iframe.mediadelivery.net/embed/1/id?token=old',
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
          durationSec: 120,
        }}
      />,
    );
    act(() => handlers.ready?.());

    expect(() => view.unmount()).not.toThrow();
    expect(player.off).toHaveBeenCalledTimes(5);
  });

  it('refreshes the server-rendered gate after a renewal or access failure', async () => {
    const now = Date.parse('2026-11-13T00:00:00Z');
    vi.useFakeTimers({ now });
    apiFetchMock.mockResolvedValue({
      ok: false,
      kind: 'error',
      status: 403,
    });
    render(
      <LessonPlayer
        lessonId="lesson-id"
        label="Lesson"
        poster={null}
        unsupported="No support"
        video={{
          provider: 'BUNNY',
          embedUrl: 'https://iframe.mediadelivery.net/embed/1/id?token=old',
          expiresAt: new Date(now + 60_000).toISOString(),
          durationSec: 120,
        }}
      />,
    );
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await act(async () => Promise.resolve());
    expect(routerRefreshMock).toHaveBeenCalled();
  });
});
