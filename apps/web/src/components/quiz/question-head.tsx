import type { QuestionImage } from '@app/shared';

/** Prompt, brush hanzi and image shared by the sheet and the review. */
export function QuestionBody({
  hanzi,
  image,
  prompt,
}: {
  prompt: string;
  hanzi: string | null;
  image: QuestionImage | null;
}): React.JSX.Element {
  return (
    <>
      <span className="mt-1 block text-2xl font-semibold leading-[1.4] text-deep">
        {prompt}
      </span>
      {hanzi ? (
        <span
          lang="zh"
          className="mt-4 block font-brush text-[3rem] leading-[1.25] tracking-[0.06em] text-cobalt"
        >
          {hanzi}
        </span>
      ) : null}
      {image ? (
        <span className="mt-4 block max-w-[28rem] overflow-hidden rounded-2xl">
          <img
            src={image.url}
            alt=""
            width={image.width}
            height={image.height}
            className="h-auto w-full"
          />
        </span>
      ) : null}
    </>
  );
}
