import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LessonPlayer, PLAYERJS_SRC } from './lesson-player';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// next/script only matters here for its `src` and `onReady`, which fires once
// the (pinned) script is loaded.
vi.mock('next/script', async () => {
  const react = await import('react');
  return {
    default: ({ src, onReady }: { src: string; onReady?: () => void }) => {
      react.useEffect(() => onReady?.(), [onReady]);
      return react.createElement('span', { 'data-script': src });
    },
  };
});

describe('LessonPlayer', () => {
  afterEach(cleanup);

  it('plays a LOCAL video with the native element', () => {
    render(
      <LessonPlayer
        label="Lesson video"
        poster="/media/poster.webp"
        unsupported="No support"
        video={{
          provider: 'LOCAL',
          src: '/api/v1/videos/abc/stream',
          mime: 'video/mp4',
          durationSec: 12,
        }}
      />,
    );
    const video = screen.getByTestId('lesson-video');
    expect(video.tagName).toBe('VIDEO');
    expect(video).toHaveAttribute('src', '/api/v1/videos/abc/stream');
    expect(video).toHaveAttribute('poster', '/media/poster.webp');
    expect(screen.queryByTestId('lesson-embed')).toBeNull();
  });

  it('embeds a BUNNY video in a titled, responsive iframe', () => {
    const embedUrl =
      'https://iframe.mediadelivery.net/embed/4242/guid?token=t&expires=1&autoplay=false&preload=true&responsive=true';
    const { container } = render(
      <LessonPlayer
        label="Greetings"
        poster={null}
        unsupported="No support"
        video={{
          provider: 'BUNNY',
          embedUrl,
          expiresAt: '2026-01-01T00:00:00.000Z',
          durationSec: 42,
        }}
      />,
    );
    const frame = screen.getByTestId('lesson-embed');
    expect(frame.parentElement?.parentElement).toHaveAttribute(
      'data-reveal',
      '',
    );
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', embedUrl);
    expect(frame).toHaveAttribute('title', 'Greetings');
    expect(frame).toHaveAttribute('loading', 'lazy');
    expect(frame).toHaveAttribute('allowfullscreen');
    expect(frame.getAttribute('allow')).toBe(
      'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture',
    );
    expect(frame.parentElement?.className).toContain('aspect-video');
    expect(screen.queryByTestId('lesson-video')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
  });
});

describe('LessonPlayer progress tracking', () => {
  afterEach(cleanup);

  function controller() {
    return {
      tick: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      seeking: vi.fn(),
      ended: vi.fn(),
      setDuration: vi.fn(),
      flush: vi.fn(),
    };
  }

  function mount(lastPositionSec = 0) {
    const progress = controller();
    render(
      <LessonPlayer
        label="Lesson video"
        poster={null}
        unsupported="No support"
        progress={{ controller: progress, lastPositionSec }}
        video={{
          provider: 'LOCAL',
          src: '/api/v1/videos/abc/stream',
          mime: 'video/mp4',
          durationSec: 100,
        }}
      />,
    );
    const video = screen.getByTestId('lesson-video') as HTMLVideoElement;
    const define = (name: string, value: unknown) =>
      Object.defineProperty(video, name, { value, configurable: true });
    define('duration', 100);
    define('paused', false);
    define('seeking', false);
    define('ended', false);
    define('playbackRate', 1);
    return { progress, video, define };
  }

  it('reports played time, seeks, pauses and the end to the controller', () => {
    const { progress, video, define } = mount();
    fireEvent.loadedMetadata(video);
    expect(progress.setDuration).toHaveBeenCalledWith(100);
    fireEvent.play(video);
    expect(progress.play).toHaveBeenCalled();

    define('currentTime', 3);
    fireEvent.timeUpdate(video);
    expect(progress.tick).toHaveBeenCalledWith(3, 1);

    fireEvent.seeking(video);
    expect(progress.seeking).toHaveBeenCalled();

    define('currentTime', 9);
    fireEvent.pause(video);
    expect(progress.pause).toHaveBeenCalledWith(9);

    define('ended', true);
    fireEvent.ended(video);
    expect(progress.ended).toHaveBeenCalledWith(100);
  });

  it('does not count time updates while paused or seeking', () => {
    const { progress, video, define } = mount();
    define('currentTime', 4);
    define('paused', true);
    fireEvent.timeUpdate(video);
    define('paused', false);
    define('seeking', true);
    fireEvent.timeUpdate(video);
    expect(progress.tick).not.toHaveBeenCalled();
  });

  it('resumes at the saved position, but not near the end', () => {
    const { video } = mount(40);
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(40);
    cleanup();
    const nearEnd = mount(97);
    fireEvent.loadedMetadata(nearEnd.video);
    expect(nearEnd.video.currentTime).toBe(0);
  });

  it('does nothing without a controller (anonymous viewers)', () => {
    render(
      <LessonPlayer
        label="Lesson video"
        poster={null}
        unsupported="No support"
        video={{
          provider: 'LOCAL',
          src: '/api/v1/videos/abc/stream',
          mime: 'video/mp4',
          durationSec: null,
        }}
      />,
    );
    const video = screen.getByTestId('lesson-video');
    expect(() => {
      fireEvent.play(video);
      fireEvent.timeUpdate(video);
      fireEvent.pause(video);
    }).not.toThrow();
  });
});

describe('LessonPlayer with Bunny player.js', () => {
  afterEach(() => {
    cleanup();
    delete window.playerjs;
  });

  it('loads the pinned player.js and forwards its events', () => {
    const handlers: Record<string, (data?: unknown) => void> = {};
    const player = {
      on: (event: string, callback: (data?: unknown) => void) => {
        handlers[event] = callback;
      },
      getDuration: (callback: (seconds: number) => void) => callback(120),
      setCurrentTime: vi.fn(),
    };
    window.playerjs = {
      Player: function Player() {
        return player;
      } as unknown as NonNullable<typeof window.playerjs>['Player'],
    };
    const controller = {
      tick: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      seeking: vi.fn(),
      ended: vi.fn(),
      setDuration: vi.fn(),
      flush: vi.fn(),
    };
    const { container } = render(
      <LessonPlayer
        label="Greetings"
        poster={null}
        unsupported="No support"
        progress={{ controller, lastPositionSec: 30 }}
        video={{
          provider: 'BUNNY',
          embedUrl: 'https://iframe.mediadelivery.net/embed/1/guid?token=t',
          expiresAt: '2026-01-01T00:00:00.000Z',
          durationSec: 120,
        }}
      />,
    );
    expect(PLAYERJS_SRC).toMatch(/player-0\.1\.0\.min\.js$/);
    expect(container.querySelector('[data-script]')).toHaveAttribute(
      'data-script',
      PLAYERJS_SRC,
    );

    handlers.ready?.();
    expect(controller.setDuration).toHaveBeenCalledWith(120);
    expect(player.setCurrentTime).toHaveBeenCalledWith(30);
    handlers.play?.();
    expect(controller.play).toHaveBeenCalled();
    handlers.timeupdate?.({ seconds: 12.5, duration: 120 });
    expect(controller.tick).toHaveBeenCalledWith(12.5);
    handlers.pause?.();
    expect(controller.pause).toHaveBeenCalled();
    handlers.ended?.();
    expect(controller.ended).toHaveBeenCalledWith(120);
  });

  it('does not load player.js for anonymous viewers', () => {
    const { container } = render(
      <LessonPlayer
        label="Greetings"
        poster={null}
        unsupported="No support"
        video={{
          provider: 'BUNNY',
          embedUrl: 'https://iframe.mediadelivery.net/embed/1/guid?token=t',
          expiresAt: '2026-01-01T00:00:00.000Z',
          durationSec: 120,
        }}
      />,
    );
    expect(container.querySelector('[data-script]')).toBeNull();
  });
});
