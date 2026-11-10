import { Check } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import type { AttemptSummary, Locale } from '@app/shared';

import { formatDateTime } from '@/lib/format';
import { formatPercent } from '@/lib/numbers';

/** The learner's past attempts, newest first, each linking to its review. */
export async function AttemptHistory({
  attempts,
  basePath,
  currentId,
  locale,
}: {
  attempts: AttemptSummary[];
  /** `/{locale}/learn/{level}/{lesson}/quiz/{quiz}` */
  basePath: string;
  currentId?: string;
  locale: Locale;
}): Promise<React.JSX.Element | null> {
  if (attempts.length === 0) return null;
  const t = await getTranslations({ locale, namespace: 'Quiz' });

  return (
    <section aria-labelledby="history-title" className="mt-14">
      <h2 id="history-title" className="text-xl font-semibold text-deep">
        {t('historyTitle')}
      </h2>
      <ol
        aria-label={t('historyLabel')}
        data-testid="attempt-history"
        className="mt-4 border-t-2 border-cobalt"
      >
        {attempts.map((attempt) => (
          <li key={attempt.id} className="border-b border-wash">
            <Link
              href={`${basePath}/attempts/${attempt.id}`}
              aria-current={attempt.id === currentId ? 'page' : undefined}
              className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-6 gap-y-1 py-3 text-deep hover:bg-glaze-bright/70"
            >
              <span className="tabular text-cobalt">
                {formatDateTime(attempt.createdAt, locale)}
              </span>
              <span className="font-semibold tabular">
                {formatPercent(attempt.score, locale)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                {attempt.passed ? (
                  <Check
                    aria-hidden="true"
                    className="size-4"
                    strokeWidth={3}
                  />
                ) : null}
                {attempt.passed ? t('passedLabel') : t('notYetLabel')}
                <span className="sr-only"> · {t('viewReview')}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
