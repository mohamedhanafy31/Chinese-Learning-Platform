'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';

/**
 * The body of every route group's `error.tsx`: an honest message, a retry
 * (`reset()` re-renders the segment) and a way home. Nothing about the error
 * itself is shown to the visitor.
 */
export function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const t = useTranslations('Errors');
  const locale = useLocale();

  useEffect(() => {
    // Leaves a trace in the browser console; the server already logged it.
    console.error(error);
  }, [error]);

  return (
    <section
      role="alert"
      className="mx-auto max-w-[1100px] px-4 py-20 text-center sm:px-8 lg:py-24"
    >
      <h1 className="font-display text-balance text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.1] text-deep">
        {t('title')}
      </h1>
      <p className="mx-auto mt-5 max-w-[34rem] text-lg leading-[1.8] text-cobalt">
        {t('body')}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-14 items-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt"
        >
          {t('tryAgain')}
        </button>
        <Link
          href={`/${locale}`}
          className="inline-flex min-h-14 items-center text-lg text-cobalt underline decoration-wash-strong underline-offset-8 transition-colors hover:text-deep"
        >
          {t('home')}
        </Link>
      </div>
    </section>
  );
}
