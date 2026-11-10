import { Check } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import type { LearnerQuizSummary, Locale } from '@app/shared';

import { primaryButtonClass } from '@/components/admin/classes';
import { pick } from '@/lib/localized';
import { formatPercent, numberFormat } from '@/lib/numbers';

/** "Check your understanding": the lesson's live quizzes as a ruled list. */
export async function QuizList({
  lessonPath,
  locale,
  quizzes,
  signedIn,
}: {
  locale: Locale;
  quizzes: LearnerQuizSummary[];
  /** `/{locale}/learn/{level}/{lesson}`: quiz pages hang off it. */
  lessonPath: string;
  signedIn: boolean;
}): Promise<React.JSX.Element | null> {
  if (quizzes.length === 0) return null;
  const t = await getTranslations({ locale, namespace: 'Quiz' });
  const nf = numberFormat(locale);

  return (
    <section aria-labelledby="quiz-list-title" className="mt-14">
      <h2 id="quiz-list-title" className="text-2xl font-semibold text-deep">
        {t('listTitle')}
      </h2>
      <ul aria-label={t('listLabel')} className="mt-6 border-t-2 border-cobalt">
        {quizzes.map((quiz) => {
          const quizPath = `${lessonPath}/quiz/${quiz.id}`;
          const href = signedIn
            ? quizPath
            : `/${locale}/login?${new URLSearchParams({ next: quizPath })}`;
          return (
            <li
              key={quiz.id}
              data-testid="quiz-row"
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 border-b border-wash py-5"
            >
              <div className="min-w-0">
                <p className="text-xl font-semibold text-deep">
                  {pick(quiz.title, locale)}
                </p>
                <p className="mt-1 text-sm tabular text-cobalt">
                  {t('questions', {
                    count: quiz.questionCount,
                    n: nf.format(quiz.questionCount),
                  })}
                  {' · '}
                  {t('passMark', {
                    pass: formatPercent(quiz.passingScore, locale),
                  })}
                </p>
                <p
                  data-testid="quiz-state"
                  className={`mt-2 inline-flex items-center gap-1.5 text-sm font-semibold tabular ${
                    quiz.best && !quiz.best.passed
                      ? 'text-cobalt'
                      : quiz.best
                        ? 'text-deep'
                        : 'text-unfired-ink'
                  }`}
                >
                  {quiz.best?.passed ? (
                    <Check
                      aria-hidden="true"
                      className="size-4"
                      strokeWidth={3}
                    />
                  ) : null}
                  {quiz.best
                    ? quiz.best.passed
                      ? t('statePassed', {
                          score: formatPercent(quiz.best.score, locale),
                        })
                      : t('stateBest', {
                          score: formatPercent(quiz.best.score, locale),
                        })
                    : t('stateNone')}
                </p>
              </div>
              <Link
                href={href}
                className={primaryButtonClass}
                aria-label={`${quiz.attempts > 0 ? t('tryAgain') : t('start')}: ${pick(quiz.title, locale)}`}
              >
                {quiz.attempts > 0 ? t('tryAgain') : t('start')}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
