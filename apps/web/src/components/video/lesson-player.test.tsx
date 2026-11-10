import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LessonPlayer } from './lesson-player';

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
