import { Lock } from 'lucide-react';

/** A centred card for viewers who cannot take a quiz (signed out, no access, error). */
export function GateCard({
  actions,
  body,
  title,
}: {
  title: string;
  body: string;
  actions?: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="mx-auto max-w-[1100px] px-4 py-16 sm:px-8 lg:py-24">
      <div
        data-testid="quiz-gate"
        className="mx-auto max-w-[40rem] rounded-2xl bg-glaze-shade p-8 text-center sm:p-12"
      >
        <span
          aria-hidden="true"
          className="mx-auto grid size-14 place-items-center rounded-full border-2 border-dashed border-unfired bg-glaze text-unfired-ink"
        >
          <Lock className="size-6" strokeWidth={2} />
        </span>
        <h1 className="mt-6 font-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.1] text-deep">
          {title}
        </h1>
        <p className="mt-4 text-lg leading-[1.8] text-cobalt">{body}</p>
        {actions ? (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}
