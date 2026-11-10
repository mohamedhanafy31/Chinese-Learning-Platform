/**
 * The lesson video in its porcelain frame: a bright glaze mount with 1rem
 * corners and a soft cobalt-tinted lift, `deep` ground behind any letterbox.
 * Native controls only: keyboard, captions menus and fullscreen come from the
 * browser. Downloads and picture-in-picture are switched off.
 */
export function LessonPlayer({
  label,
  poster,
  src,
  unsupported,
}: {
  label: string;
  src: string;
  poster: string | null;
  unsupported: string;
}): React.JSX.Element {
  return (
    <div
      data-reveal=""
      className="rounded-2xl bg-white p-2 shadow-[0_34px_40px_-28px_rgb(3_10_40/0.55)]"
    >
      <div className="overflow-hidden rounded-xl bg-deep">
        <video
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
