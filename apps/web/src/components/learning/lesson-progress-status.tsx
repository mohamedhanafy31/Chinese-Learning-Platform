'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import type { Locale } from '@app/shared';

import { Seal } from '@/components/porcelain/seal';
import { formatPercent, numberFormat } from '@/lib/numbers';

/** What the status needs of a lesson's progress; the playback `progress` fits. */
export interface StatusProgress {
  watchedPercent: number;
  complete: boolean;
  hasVideo: boolean;
  quizzes: { total: number; passed: number };
  nextLessonId: string | null;
}

/**
 * The quiet requirements line under the player, and, once the lesson is
 * complete, the "Lesson complete" status: the small 马 seal (the only cinnabar
 * here; it is the same meaning as the fired row on the path) and the primary
 * pill to the next lesson. The pill is "Primary on glaze", never the seal pill.
 */
export function LessonProgressStatus({
  levelSlug,
  levelTitle,
  progress,
}: {
  levelSlug: string;
  levelTitle: string;
  progress: StatusProgress;
}): React.JSX.Element | null {
  const t = useTranslations('Watch');
  const tPath = useTranslations('Path');
  const locale = useLocale() as Locale;
  const nf = numberFormat(locale);
  const sealRef = useRef<HTMLSpanElement>(null);

  // The seal can appear after the page's scroll observer started, so it is
  // marked in view here (same as the purchase seal).
  useEffect(() => {
    if (progress.complete && sealRef.current) {
      sealRef.current.dataset.inview = 'true';
    }
  }, [progress.complete]);

  const parts: string[] = [];
  if (progress.hasVideo) {
    parts.push(
      t('requireVideo', {
        percent: formatPercent(progress.watchedPercent, locale),
      }),
    );
  }
  if (progress.quizzes.total > 0) {
    parts.push(
      t('requireQuizzes', {
        passed: nf.format(progress.quizzes.passed),
        total: nf.format(progress.quizzes.total),
      }),
    );
  }

  return (
    <div data-testid="lesson-progress" className="mt-5">
      {parts.length > 0 ? (
        <p
          data-testid="lesson-requirements"
          aria-label={t('requirementsLabel')}
          className="text-sm text-cobalt tabular"
        >
          {parts.join(' · ')}
        </p>
      ) : null}
      {progress.complete ? (
        <div
          role="status"
          data-testid="lesson-complete"
          className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-4"
        >
          <span
            ref={sealRef}
            data-reveal="seal"
            suppressHydrationWarning
            className="inline-flex"
          >
            <Seal size={30} label={tPath('sealedBy')} />
          </span>
          <p className="text-lg font-semibold text-deep">{t('complete')}</p>
          {progress.nextLessonId ? (
            <Link
              href={`/${locale}/learn/${levelSlug}/${progress.nextLessonId}`}
              className="inline-flex min-h-14 items-center justify-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt"
            >
              {t('nextLesson')}
            </Link>
          ) : (
            <div className="w-full basis-full">
              <p className="font-semibold text-deep">
                {t('levelCongratulations')}
              </p>
              <p className="mt-1 text-cobalt">{levelTitle}</p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                <Link
                  href={`/${locale}/levels/${levelSlug}`}
                  className="text-cobalt underline decoration-wash-strong underline-offset-4 hover:text-deep"
                >
                  {t('backToLevel')}
                </Link>
                <Link
                  href={`/${locale}/dashboard`}
                  className="text-cobalt underline decoration-wash-strong underline-offset-4 hover:text-deep"
                >
                  {t('goToMyLevels')}
                </Link>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
