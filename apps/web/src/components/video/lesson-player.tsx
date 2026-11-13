'use client';

import {
  Check,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Settings2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Locale, PlaybackVideo } from '@app/shared';

import type { LessonProgressController } from '@/lib/use-lesson-progress';
import {
  formatDuration,
  formatPlaybackRate,
  formatVideoQuality,
} from '@/lib/video-format';
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

export interface PlayerLabels {
  loading: string;
  play: string;
  pause: string;
  seek: string;
  mute: string;
  unmute: string;
  fullscreen: string;
  exitFullscreen: string;
  settings: string;
  playbackSpeed: string;
  quality: string;
  originalQuality: string;
}

const DEFAULT_PLAYER_LABELS: PlayerLabels = {
  loading: 'Preparing the video…',
  play: 'Play video',
  pause: 'Pause video',
  seek: 'Video position',
  mute: 'Mute sound',
  unmute: 'Turn sound on',
  fullscreen: 'Enter full screen',
  exitFullscreen: 'Exit full screen',
  settings: 'Video settings',
  playbackSpeed: 'Playback speed',
  quality: 'Quality',
  originalQuality: 'Original',
};

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/**
 * The lesson video in its porcelain frame: a bright glaze mount with 1rem
 * corners and a soft cobalt-tinted lift, `deep` ground behind any letterbox.
 * A LOCAL video uses the platform's localized controls, keyboard shortcuts and
 * fullscreen shell; downloads and picture-in-picture are deliberately off.
 * A BUNNY video is Bunny's signed embed in a responsive 16:9 iframe, observed
 * through player.js. With `progress`, both feed the progress controller.
 */
export function LessonPlayer({
  label,
  poster,
  progress,
  unsupported,
  video,
  videoTestId = 'lesson-video',
  labels = DEFAULT_PLAYER_LABELS,
  locale = 'en',
}: {
  /** Accessible name of the player; the lesson title for the embed. */
  label: string;
  video: PlaybackVideo;
  poster: string | null;
  unsupported: string;
  progress?: PlayerProgress;
  labels?: PlayerLabels;
  locale?: Locale;
  /** Lets another surface retain its established video locator. */
  videoTestId?: string;
}): React.JSX.Element {
  if (video.provider === 'BUNNY') {
    return (
      <BunnyPlayer
        label={label}
        embedUrl={video.embedUrl}
        progress={progress}
        loadingLabel={labels.loading}
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
      labels={labels}
      locale={locale}
      videoTestId={videoTestId}
    />
  );
}

function LocalPlayer({
  label,
  poster,
  progress,
  src,
  unsupported,
  labels,
  locale,
  videoTestId,
}: {
  label: string;
  src: string;
  poster: string | null;
  unsupported: string;
  progress?: PlayerProgress;
  labels: PlayerLabels;
  locale: Locale;
  videoTestId: string;
}): React.JSX.Element {
  const shell = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLVideoElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const controller = progress?.controller;
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playingNow, setPlayingNow] = useState(false);
  const [muted, setMuted] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoHeight, setVideoHeight] = useState(0);
  const playing = (video: HTMLVideoElement): boolean =>
    !video.paused && !video.seeking && !video.ended;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    // A cached/local asset can reach `canplay` before React hydrates this
    // client component. Reconcile the element's current state so the loading
    // veil never remains over a video that is already ready.
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      setWaiting(false);
    }
    if (Number.isFinite(video.duration) && video.duration > 0) {
      setDuration(video.duration);
      controller?.setDuration(video.duration);
      const resume = resumePosition(
        progress?.lastPositionSec ?? 0,
        video.duration,
      );
      if (resume > 0 && video.currentTime === 0) {
        video.currentTime = resume;
        setCurrentTime(resume);
      }
    }
    setVideoHeight(video.videoHeight);
  }, [controller, progress?.lastPositionSec]);

  useEffect(() => {
    const update = (): void =>
      setFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const close = (event: PointerEvent): void => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [settingsOpen]);

  function togglePlayback(): void {
    const video = ref.current;
    if (!video || failed) return;
    if (video.paused || video.ended) {
      void video.play().catch(() => setFailed(true));
    } else {
      video.pause();
    }
  }

  function toggleMute(): void {
    const video = ref.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  function toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void shell.current?.requestFullscreen();
    }
  }

  function onPlayerKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    const video = ref.current;
    if (!video) return;
    const key = event.key.toLowerCase();
    if (key === ' ' || key === 'k') {
      event.preventDefault();
      togglePlayback();
    } else if (key === 'm') {
      toggleMute();
    } else if (key === 'f') {
      toggleFullscreen();
    } else if (event.key === 'Escape') {
      setSettingsOpen(false);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      video.currentTime = Math.max(0, video.currentTime - 5);
    }
  }

  const progressPercent =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div
      ref={shell}
      data-reveal=""
      suppressHydrationWarning
      data-testid="player-shell"
      tabIndex={0}
      onKeyDown={onPlayerKeyDown}
      className={`${
        fullscreen
          ? 'flex size-full flex-col rounded-none bg-deep p-0 shadow-none'
          : FRAME
      } overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cobalt`}
    >
      <div
        data-testid="player-stage"
        className={`relative overflow-hidden bg-deep ${
          fullscreen
            ? 'flex min-h-0 flex-1 items-center justify-center rounded-none'
            : 'rounded-t-xl'
        }`}
      >
        <video
          ref={ref}
          data-testid={videoTestId}
          playsInline
          preload="metadata"
          controlsList="nodownload"
          disablePictureInPicture
          src={src}
          poster={poster ?? undefined}
          aria-label={label}
          onClick={togglePlayback}
          onDoubleClick={toggleFullscreen}
          onLoadStart={() => {
            setWaiting(true);
            setFailed(false);
          }}
          className={`block w-full bg-deep ${
            fullscreen ? 'h-full min-h-0 object-contain' : 'aspect-video'
          }`}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            setDuration(video.duration);
            setVideoHeight(video.videoHeight);
            controller?.setDuration(video.duration);
            const resume = resumePosition(
              progress?.lastPositionSec ?? 0,
              video.duration,
            );
            if (resume > 0) {
              video.currentTime = resume;
              setCurrentTime(resume);
            }
          }}
          onCanPlay={() => setWaiting(false)}
          onWaiting={() => setWaiting(true)}
          onPlay={() => {
            setPlayingNow(true);
            controller?.play();
          }}
          onPlaying={() => setWaiting(false)}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            setCurrentTime(video.currentTime);
            if (playing(video)) {
              controller?.tick(video.currentTime, video.playbackRate);
            }
          }}
          onSeeking={() => controller?.seeking()}
          onPause={(event) => {
            const video = event.currentTarget;
            setPlayingNow(false);
            setCurrentTime(video.currentTime);
            if (!video.ended) controller?.pause(video.currentTime);
          }}
          onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
          onRateChange={(event) =>
            setPlaybackRate(event.currentTarget.playbackRate)
          }
          onError={() => {
            setWaiting(false);
            setFailed(true);
          }}
          onEnded={(event) => {
            setPlayingNow(false);
            setCurrentTime(event.currentTarget.duration);
            controller?.ended(event.currentTarget.duration);
          }}
        >
          {unsupported}
        </video>

        {waiting && !failed ? (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 grid place-items-center bg-deep/70 text-glaze"
          >
            <span className="flex items-center gap-3 rounded-full bg-abyss/90 px-4 py-2 text-sm font-semibold">
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
              {labels.loading}
            </span>
          </div>
        ) : null}

        {!playingNow && !waiting && !failed ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <button
              type="button"
              onClick={togglePlayback}
              aria-label={labels.play}
              className="pointer-events-auto grid size-16 place-items-center rounded-full bg-glaze text-deep shadow-[0_18px_36px_-16px_rgb(3_10_40/0.75)] transition-transform hover:scale-105"
            >
              <Play aria-hidden="true" className="size-7 rtl:-scale-x-100" />
            </button>
          </div>
        ) : null}

        {failed ? (
          <div
            role="alert"
            data-process-feedback=""
            className="absolute inset-0 grid place-items-center bg-deep px-6 text-center text-glaze"
          >
            <p className="max-w-[28rem] font-semibold leading-relaxed">
              {unsupported}
            </p>
          </div>
        ) : null}
      </div>

      <div
        data-testid="player-controls"
        className={`flex shrink-0 flex-wrap items-center gap-2 bg-deep px-2 py-2 text-glaze sm:gap-3 sm:px-3 ${
          fullscreen ? 'rounded-none' : 'rounded-b-xl'
        }`}
      >
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={playingNow ? labels.pause : labels.play}
          className="grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-cobalt"
        >
          {playingNow ? (
            <Pause aria-hidden="true" className="size-5" />
          ) : (
            <Play aria-hidden="true" className="size-5 rtl:-scale-x-100" />
          )}
        </button>

        <div
          dir="ltr"
          data-testid="video-progress-track"
          className="relative order-last h-6 w-full grow basis-full sm:order-none sm:w-auto sm:basis-0"
        >
          <span className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-wash-strong/45">
            <span
              data-testid="video-progress-fill"
              className="absolute inset-y-0 start-0 bg-glaze transition-[width] duration-150"
              style={{ width: `${progressPercent}%` }}
            />
          </span>
          <input
            dir="ltr"
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={0.1}
            value={Math.min(currentTime, Math.max(duration, 1))}
            disabled={duration <= 0 || failed}
            aria-label={labels.seek}
            aria-valuetext={`${formatDuration(currentTime, locale)} / ${formatDuration(duration, locale)}`}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              if (ref.current) ref.current.currentTime = next;
              setCurrentTime(next);
            }}
            className="video-scrubber absolute inset-0 size-full cursor-pointer disabled:cursor-not-allowed"
          />
        </div>

        <span
          data-testid="video-time"
          className="min-w-[5.75rem] text-center text-xs tabular text-wash sm:text-sm"
          dir="ltr"
        >
          <bdi dir="ltr">{formatDuration(currentTime, locale)}</bdi>
          <span aria-hidden="true"> / </span>
          <bdi dir="ltr">{formatDuration(duration, locale)}</bdi>
        </span>

        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? labels.unmute : labels.mute}
          className="grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-cobalt"
        >
          {muted ? (
            <VolumeX aria-hidden="true" className="size-5" />
          ) : (
            <Volume2 aria-hidden="true" className="size-5" />
          )}
        </button>

        <div ref={settingsRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label={labels.settings}
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            className="grid size-11 place-items-center rounded-full transition-colors hover:bg-cobalt"
          >
            <Settings2 aria-hidden="true" className="size-5" />
          </button>

          {settingsOpen ? (
            <div
              role="dialog"
              aria-label={labels.settings}
              data-process-feedback=""
              className={`z-20 rounded-2xl bg-glaze p-4 text-deep shadow-[0_24px_40px_-20px_rgb(3_10_40/0.6)] ${
                fullscreen
                  ? 'fixed inset-x-4 bottom-28 w-auto sm:absolute sm:inset-x-auto sm:bottom-[calc(100%+0.75rem)] sm:end-0 sm:w-[min(17rem,calc(100vw-2rem))]'
                  : 'absolute bottom-[calc(100%+0.75rem)] end-0 w-[min(17rem,calc(100vw-2rem))]'
              }`}
            >
              <p className="text-sm font-semibold">{labels.playbackSpeed}</p>
              <div className="mt-3 grid grid-cols-3 gap-2" role="group">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    aria-pressed={playbackRate === speed}
                    onClick={() => {
                      if (ref.current) ref.current.playbackRate = speed;
                      setPlaybackRate(speed);
                    }}
                    className={`min-h-10 rounded-full px-3 text-sm tabular transition-colors ${
                      playbackRate === speed
                        ? 'bg-deep text-glaze'
                        : 'bg-glaze-shade text-cobalt hover:bg-wash'
                    }`}
                    dir="ltr"
                  >
                    {formatPlaybackRate(speed, locale)}
                  </button>
                ))}
              </div>

              <div className="mt-4 border-t border-wash pt-4">
                <p className="text-sm font-semibold">{labels.quality}</p>
                <div className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-xl bg-glaze-shade px-3 text-sm text-cobalt">
                  <span>{labels.originalQuality}</span>
                  <span className="flex items-center gap-2 tabular" dir="ltr">
                    {videoHeight > 0
                      ? formatVideoQuality(videoHeight, locale)
                      : null}
                    <Check aria-hidden="true" className="size-4" />
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? labels.exitFullscreen : labels.fullscreen}
          className="grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-cobalt"
        >
          {fullscreen ? (
            <Minimize2 aria-hidden="true" className="size-5" />
          ) : (
            <Maximize2 aria-hidden="true" className="size-5" />
          )}
        </button>
      </div>
    </div>
  );
}

function BunnyPlayer({
  embedUrl,
  label,
  loadingLabel,
  progress,
}: {
  label: string;
  embedUrl: string;
  loadingLabel: string;
  progress?: PlayerProgress;
}): React.JSX.Element {
  const frame = useRef<HTMLIFrameElement>(null);
  const attached = useRef(false);
  const [loaded, setLoaded] = useState(false);
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
    <div data-reveal="" suppressHydrationWarning className={FRAME}>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-deep">
        {!loaded ? (
          <div
            role="status"
            className="absolute inset-0 z-10 grid place-items-center text-glaze"
          >
            <span className="flex items-center gap-3 rounded-full bg-abyss/90 px-4 py-2 text-sm font-semibold">
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
              {loadingLabel}
            </span>
          </div>
        ) : null}
        <iframe
          ref={frame}
          data-testid="lesson-embed"
          src={embedUrl}
          title={label}
          allow={EMBED_ALLOW}
          allowFullScreen
          loading="lazy"
          onLoad={() => setLoaded(true)}
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
      suppressHydrationWarning
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
