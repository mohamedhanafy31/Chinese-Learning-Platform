'use client';

import Script from 'next/script';
import { useCallback, useRef } from 'react';

import type { PlaybackVideo } from '@app/shared';

import type { LessonProgressController } from '@/lib/use-lesson-progress';
import { resumePosition } from '@/lib/watch-tracker';

const FRAME =
  'rounded-2xl bg-white p-2 shadow-[0_34px_40px_-28px_rgb(3_10_40/0.55)]';

/** What a signed Bunny embed may do inside its iframe, and nothing more. */
const EMBED_ALLOW =
  'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture';

/** Bunny Stream's player.js, pinned; it talks to the embed over postMessage. */
export const PLAYERJS_SRC =
  'https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js';

interface PlayerJsPlayer {
  on(event: string, callback: (data?: PlayerJsEvent) => void): void;
  off?(event: string): void;
  getDuration(callback: (seconds: number) => void): void;
  setCurrentTime(seconds: number): void;
}
interface PlayerJsEvent {
  seconds?: number;
  duration?: number;
}
declare global {
  interface Window {
    playerjs?: { Player: new (element: HTMLIFrameElement) => PlayerJsPlayer };
  }
}

/** What the player reports to the progress controller, and where to resume. */
export interface PlayerProgress {
  controller: LessonProgressController;
  lastPositionSec: number;
}

/**
 * The lesson video in its porcelain frame: a bright glaze mount with 1rem
 * corners and a soft cobalt-tinted lift, `deep` ground behind any letterbox.
 * A LOCAL video uses native controls only (keyboard, captions menus and
 * fullscreen come from the browser; downloads and picture-in-picture are off).
 * A BUNNY video is Bunny's signed embed in a responsive 16:9 iframe, observed
 * through player.js. With `progress`, both feed the progress controller.
 */
export function LessonPlayer({
  label,
  poster,
  progress,
  unsupported,
  video,
}: {
  /** Accessible name of the player; the lesson title for the embed. */
  label: string;
  video: PlaybackVideo;
  poster: string | null;
  unsupported: string;
  progress?: PlayerProgress;
}): React.JSX.Element {
  if (video.provider === 'BUNNY') {
    return (
      <BunnyPlayer
        label={label}
        embedUrl={video.embedUrl}
        progress={progress}
      />
    );
  }
  return (
    <LocalPlayer
      label={label}
      src={video.src}
      poster={poster}
      unsupported={unsupported}
      progress={progress}
    />
  );
}

function LocalPlayer({
  label,
  poster,
  progress,
  src,
  unsupported,
}: {
  label: string;
  src: string;
  poster: string | null;
  unsupported: string;
  progress?: PlayerProgress;
}): React.JSX.Element {
  const ref = useRef<HTMLVideoElement>(null);
  const controller = progress?.controller;
  const playing = (video: HTMLVideoElement): boolean =>
    !video.paused && !video.seeking && !video.ended;

  return (
    <div data-reveal="" className={FRAME}>
      <div className="overflow-hidden rounded-xl bg-deep">
        <video
          ref={ref}
          data-testid="lesson-video"
          controls
          playsInline
          preload="metadata"
          controlsList="nodownload"
          disablePictureInPicture
          src={src}
          poster={poster ?? undefined}
          aria-label={label}
          className="block aspect-video w-full bg-deep"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            controller?.setDuration(video.duration);
            const resume = resumePosition(
              progress?.lastPositionSec ?? 0,
              video.duration,
            );
            if (resume > 0) video.currentTime = resume;
          }}
          onPlay={() => controller?.play()}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            if (playing(video)) {
              controller?.tick(video.currentTime, video.playbackRate);
            }
          }}
          onSeeking={() => controller?.seeking()}
          onPause={(event) => {
            const video = event.currentTarget;
            if (!video.ended) controller?.pause(video.currentTime);
          }}
          onEnded={(event) => controller?.ended(event.currentTarget.duration)}
        >
          {unsupported}
        </video>
      </div>
    </div>
  );
}

function BunnyPlayer({
  embedUrl,
  label,
  progress,
}: {
  label: string;
  embedUrl: string;
  progress?: PlayerProgress;
}): React.JSX.Element {
  const frame = useRef<HTMLIFrameElement>(null);
  const attached = useRef(false);
  const controller = progress?.controller;
  const lastPositionSec = progress?.lastPositionSec ?? 0;

  const attach = useCallback(() => {
    const element = frame.current;
    if (!controller || !element || !window.playerjs || attached.current) {
      return;
    }
    attached.current = true;
    const player = new window.playerjs.Player(element);
    player.on('ready', () => {
      player.getDuration((duration) => {
        controller.setDuration(duration);
        const resume = resumePosition(lastPositionSec, duration);
        if (resume > 0) player.setCurrentTime(resume);
      });
      player.on('play', () => controller.play());
      player.on('timeupdate', (data) => {
        if (typeof data?.seconds === 'number') controller.tick(data.seconds);
        if (typeof data?.duration === 'number') {
          controller.setDuration(data.duration);
        }
      });
      player.on('pause', () => controller.pause());
      player.on('ended', () => {
        player.getDuration((duration) => controller.ended(duration));
      });
    });
  }, [controller, lastPositionSec]);

  return (
    <div data-reveal="" className={FRAME}>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-deep">
        <iframe
          ref={frame}
          data-testid="lesson-embed"
          src={embedUrl}
          title={label}
          allow={EMBED_ALLOW}
          allowFullScreen
          loading="lazy"
          className="absolute inset-0 size-full border-0"
        />
      </div>
      {controller ? (
        <Script src={PLAYERJS_SRC} strategy="lazyOnload" onReady={attach} />
      ) : null}
    </div>
  );
}

/** The same frame with nothing to play yet, honestly labelled. */
export function VideoPlaceholder({
  body,
  title,
}: {
  title: string;
  body: string;
}): React.JSX.Element {
  return (
    <div
      data-reveal=""
      data-testid="video-coming-soon"
      className="rounded-2xl bg-white p-2 shadow-[0_34px_40px_-28px_rgb(3_10_40/0.55)]"
    >
      <div className="grid aspect-video place-items-center overflow-hidden rounded-xl border-2 border-dashed border-unfired bg-glaze-shade px-6 text-center">
        <div>
          <p className="font-display text-3xl leading-tight text-deep sm:text-4xl">
            {title}
          </p>
          <p className="mx-auto mt-3 max-w-[28rem] leading-[1.8] text-cobalt">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}
