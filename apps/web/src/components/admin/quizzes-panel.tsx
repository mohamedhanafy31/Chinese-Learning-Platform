'use client';

import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  adminQuizSummarySchema,
  z,
  type AdminQuizSummary,
  type Locale,
} from '@app/shared';

import { FormAlert } from '@/components/auth/form-controls';
import { roundIconButton, secondaryButton } from '@/components/admin/controls';
import { QuizSettingsForm } from '@/components/admin/quiz-settings-form';
import { StatusBadge } from '@/components/admin/status-badge';
import { useReorder } from '@/components/admin/use-reorder';
import { pick } from '@/lib/localized';
import { formatPercent, numberFormat } from '@/lib/numbers';

const quizzesResponse = z.object({ quizzes: z.array(adminQuizSummarySchema) });

/** The lesson's quizzes in order, with reorder and "New quiz". */
export function QuizzesPanel({
  lessonId,
  locale,
  quizzes,
}: {
  lessonId: string;
  locale: Locale;
  quizzes: AdminQuizSummary[];
}): React.JSX.Element {
  const t = useTranslations('Admin.quiz');
  const tStatus = useTranslations('Admin.status');
  const tErrors = useTranslations('Admin.errors');
  const router = useRouter();
  const pathname = usePathname();
  const nf = numberFormat(locale);
  const [creating, setCreating] = useState(false);

  const { errorKey, items, move, moved, pending } = useReorder(quizzes, {
    url: `/api/v1/admin/lessons/${lessonId}/quizzes/order`,
    parse: (data) => {
      const parsed = quizzesResponse.safeParse(data);
      return parsed.success ? parsed.data.quizzes : null;
    },
    onUnauthenticated: () =>
      router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}`),
  });
  const movedQuiz = moved ? items.find((q) => q.id === moved.id) : null;

  return (
    <section
      data-testid="quizzes-panel"
      aria-labelledby="quizzes-panel-title"
      className="rounded-2xl bg-glaze-shade p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="quizzes-panel-title"
          className="text-xl font-semibold text-deep"
        >
          {t('panelTitle')}
        </h2>
        {creating ? null : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={`${secondaryButton} gap-2`}
          >
            <Plus aria-hidden="true" className="size-5" />
            {t('newQuiz')}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-cobalt">{t('panelIntro')}</p>

      {errorKey ? (
        <div className="mt-4">
          <FormAlert>{tErrors(errorKey)}</FormAlert>
        </div>
      ) : null}
      <p role="status" className="sr-only">
        {moved && movedQuiz
          ? t('movedTo', {
              title: pick(movedQuiz.title, locale),
              position: nf.format(moved.position),
            })
          : ''}
      </p>

      {items.length === 0 ? (
        <p className="mt-6 text-cobalt">{t('empty')}</p>
      ) : (
        <ol
          aria-label={t('listLabel')}
          className="mt-6 border-t-2 border-cobalt"
        >
          {items.map((quiz, index) => {
            const title = pick(quiz.title, locale);
            return (
              <li
                key={quiz.id}
                data-reorder-id={quiz.id}
                className="border-b border-wash"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-4">
                  <div className="min-w-0">
                    <Link
                      href={`/${locale}/admin/quizzes/${quiz.id}`}
                      className="text-lg font-semibold text-deep underline decoration-wash-strong underline-offset-4 hover:decoration-deep"
                    >
                      {title}
                    </Link>
                    <p className="mt-1 text-sm tabular text-cobalt">
                      {t('summary', {
                        count: quiz.questionCount,
                        n: nf.format(quiz.questionCount),
                        points: nf.format(quiz.totalPoints),
                        pass: formatPercent(quiz.passingScore, locale),
                        attempts: nf.format(quiz.attemptCount),
                      })}
                    </p>
                    {quiz.archivedAt ? (
                      <div className="mt-2">
                        <StatusBadge
                          status="archived"
                          label={tStatus('archived')}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-move="up"
                      disabled={pending || index === 0}
                      aria-label={t('moveUp', { title })}
                      onClick={() => void move(index, -1)}
                      className={roundIconButton}
                    >
                      <ChevronUp aria-hidden="true" className="size-5" />
                    </button>
                    <button
                      type="button"
                      data-move="down"
                      disabled={pending || index === items.length - 1}
                      aria-label={t('moveDown', { title })}
                      onClick={() => void move(index, 1)}
                      className={roundIconButton}
                    >
                      <ChevronDown aria-hidden="true" className="size-5" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {creating ? (
        <div className="mt-8 rounded-2xl bg-glaze p-5">
          <h3 className="mb-4 text-lg font-semibold text-deep">
            {t('newQuiz')}
          </h3>
          <QuizSettingsForm
            lessonId={lessonId}
            locale={locale}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : null}
    </section>
  );
}
