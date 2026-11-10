import type { PlaybackVideo } from '@app/shared';

const FRAME =
  'rounded-2xl bg-white p-2 shadow-[0_34px_40px_-28px_rgb(3_10_40/0.55)]';

/** What a signed Bunny embed may do inside its iframe, and nothing more. */
const EMBED_ALLOW =
  'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture';

/**
 * The lesson video in its porcelain frame: a bright glaze mount with 1rem
 * corners and a soft cobalt-tinted lift, `deep` ground behind any letterbox.
 * A LOCAL video uses native controls only (keyboard, captions menus and
 * fullscreen come from the browser; downloads and picture-in-picture are off).
 * A BUNNY video is Bunny's signed embed in a responsive 16:9 iframe.
 */
export function LessonPlayer({
  label,
  poster,
  unsupported,
  video,
}: {
  /** Accessible name of the player; the lesson title for the embed. */
  label: string;
  video: PlaybackVideo;
  poster: string | null;
  unsupported: string;
}): React.JSX.Element {
  if (video.provider === 'BUNNY') {
    return (
      <div data-reveal="" className={FRAME}>
        <div className="relative aspect-video overflow-hidden rounded-xl bg-deep">
          <iframe
            data-testid="lesson-embed"
            src={video.embedUrl}
            title={label}
            allow={EMBED_ALLOW}
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 size-full border-0"
          />
        </div>
      </div>
    );
  }
  return (
    <div data-reveal="" className={FRAME}>
      <div className="overflow-hidden rounded-xl bg-deep">
        <video
          data-testid="lesson-video"
          controls
          playsInline
          preload="metadata"
          controlsList="nodownload"
          disablePictureInPicture
          src={video.src}
          poster={poster ?? undefined}
          aria-label={label}
          className="block aspect-video w-full bg-deep"
        >
          {unsupported}
        </video>
      </div>
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
