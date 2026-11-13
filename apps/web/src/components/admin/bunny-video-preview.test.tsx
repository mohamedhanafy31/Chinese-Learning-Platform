import { NextIntlClientProvider } from 'next-intl';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import en from '../../../messages/en.json';

const { apiFetchParsed } = vi.hoisted(() => ({ apiFetchParsed: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiFetchParsed }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/en/admin/lessons/${lessonId}`,
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

import { BunnyVideoPreview } from './bunny-video-preview';
import { VideoPanel } from './video-panel';

const lessonId = '00000000-0000-4000-8000-000000000001';
const video = {
  id: '00000000-0000-4000-8000-000000000002',
  provider: 'BUNNY',
  status: 'READY',
  mime: 'video/mp4',
  sizeBytes: 12,
  durationSec: 42,
  originalName: 'lesson.mp4',
  createdAt: '2026-11-13T00:00:00.000Z',
} as const;
const embedUrl =
  'https://iframe.mediadelivery.net/embed/4242/video-guid?token=signed&expires=1900000000';
const bunnyPlayback = {
  lesson: {
    id: lessonId,
    number: 1,
    title: { en: 'Greetings' },
    description: null,
    hanzi: '你好',
  },
  level: { slug: 'beginner', hanzi: '初级', title: { en: 'Beginner' } },
  poster: null,
  siblings: [],
  progress: null,
  video: {
    provider: 'BUNNY',
    embedUrl,
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
    durationSec: 42,
  },
};

function mountPreview() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BunnyVideoPreview lessonId={lessonId} video={video} />
    </NextIntlClientProvider>,
  );
}

describe('BunnyVideoPreview', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    delete window.playerjs;
  });

  it('shows a 16:9 loading skeleton, then the signed Bunny iframe', async () => {
    let resolve!: (value: unknown) => void;
    apiFetchParsed.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mountPreview();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('[data-skeleton]')).toHaveClass(
      'aspect-video',
    );

    await act(async () => {
      resolve({ ok: true, data: bunnyPlayback, response: Response.json({}) });
    });
    const frame = await screen.findByTestId('video-bunny-preview');
    expect(frame).toHaveAttribute('src', embedUrl);
    expect(frame).toHaveAttribute('title', 'Preview of the lesson video');
    expect(frame.parentElement?.parentElement).not.toHaveAttribute(
      'data-reveal',
    );
    expect(apiFetchParsed).toHaveBeenCalledWith(
      `/api/v1/lessons/${lessonId}/playback`,
      expect.anything(),
    );
  });

  it('shows an error and retries the descriptor request', async () => {
    apiFetchParsed
      .mockResolvedValueOnce({ ok: false, kind: 'error', status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        data: bunnyPlayback,
        response: Response.json({}),
      });
    mountPreview();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Bunny preview could not be loaded.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('video-bunny-preview')).toHaveAttribute(
      'src',
      embedUrl,
    );
    expect(apiFetchParsed).toHaveBeenCalledTimes(2);
  });

  it('falls back to the note when the descriptor is not a Bunny embed', async () => {
    apiFetchParsed.mockResolvedValue({
      ok: true,
      data: { ...bunnyPlayback, video: { provider: 'LOCAL' } },
      response: Response.json({}),
    });
    mountPreview();
    expect(await screen.findByTestId('video-bunny-note')).toHaveTextContent(
      'This video is not available as a Bunny preview.',
    );
    expect(screen.queryByTestId('video-bunny-preview')).not.toBeInTheDocument();
  });

  it('does not report admin preview playback as lesson progress', async () => {
    const handlers: Record<string, (data?: unknown) => void> = {};
    window.playerjs = {
      Player: function Player() {
        return {
          on: (
            event: string,
            callback: (data?: { seconds?: number; duration?: number }) => void,
          ) => {
            handlers[event] = callback as (data?: unknown) => void;
          },
          off: vi.fn(),
          getDuration: (callback: (seconds: number) => void) => callback(42),
          getCurrentTime: (callback: (seconds: number) => void) => callback(7),
          setCurrentTime: vi.fn(),
        };
      } as unknown as NonNullable<typeof window.playerjs>['Player'],
    };
    apiFetchParsed.mockResolvedValue({
      ok: true,
      data: bunnyPlayback,
      response: Response.json({}),
    });
    mountPreview();
    await screen.findByTestId('video-bunny-preview');
    await waitFor(() => expect(handlers.ready).toBeDefined());
    act(() => {
      handlers.ready?.();
    });
    act(() => {
      handlers.play?.();
      handlers.timeupdate?.({ seconds: 7, duration: 42 });
      handlers.pause?.();
      handlers.ended?.();
    });
    expect(apiFetchParsed).toHaveBeenCalledTimes(1);
    expect(apiFetchParsed.mock.calls[0]?.[0]).toBe(
      `/api/v1/lessons/${lessonId}/playback`,
    );
  });

  it('unmounts the admin preview when player.js cannot detach listeners', async () => {
    const handlers: Record<string, (data?: unknown) => void> = {};
    const off = vi.fn(() => {
      throw new TypeError(
        "Cannot read properties of null (reading 'postMessage')",
      );
    });
    window.playerjs = {
      Player: function Player() {
        return {
          on: (event: string, callback: (data?: unknown) => void) => {
            handlers[event] = callback;
          },
          off,
          getDuration: (callback: (seconds: number) => void) => callback(42),
          getCurrentTime: (callback: (seconds: number) => void) => callback(7),
          setCurrentTime: vi.fn(),
        };
      } as unknown as NonNullable<typeof window.playerjs>['Player'],
    };
    apiFetchParsed.mockResolvedValue({
      ok: true,
      data: bunnyPlayback,
      response: Response.json({}),
    });
    const view = mountPreview();
    await screen.findByTestId('video-bunny-preview');
    await waitFor(() => expect(handlers.ready).toBeDefined());
    act(() => handlers.ready?.());

    expect(() => view.unmount()).not.toThrow();
    expect(off).toHaveBeenCalledTimes(5);
  });
});

describe('VideoPanel LOCAL preview', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps the existing local stream preview', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <VideoPanel
          lessonId={lessonId}
          lessonTitle="Greetings"
          video={{ ...video, provider: 'LOCAL' }}
          pending={null}
          activeProvider="LOCAL"
          uploadOrigin=""
          bunnyConfigured={true}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('video-preview')).toHaveAttribute(
      'src',
      `/api/v1/videos/${video.id}/stream`,
    );
    expect(screen.queryByTestId('video-bunny-preview')).not.toBeInTheDocument();
  });

  it('does not show a player for a non-READY Bunny video', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <VideoPanel
          lessonId={lessonId}
          lessonTitle="Greetings"
          video={{ ...video, status: 'PROCESSING' }}
          pending={null}
          activeProvider="BUNNY"
          uploadOrigin=""
          bunnyConfigured={true}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId('video-bunny-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('video-bunny-note')).not.toBeInTheDocument();
  });
});
