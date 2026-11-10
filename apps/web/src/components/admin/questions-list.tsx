'use client';

import { Check, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import {
  QuestionType,
  adminQuizDetailSchema,
  type AdminQuestion,
  type Locale,
} from '@app/shared';

import { FormAlert } from '@/components/auth/form-controls';
import {
  StatusLine,
  primaryButton,
  roundIconButton,
  secondaryButton,
} from '@/components/admin/controls';
import { QuestionEditor } from '@/components/admin/question-editor';
import { useQuizErrorText } from '@/components/admin/use-quiz-error';
import { useReorder } from '@/components/admin/use-reorder';
import { apiFetch } from '@/lib/api-client';
import { pick } from '@/lib/localized';
import { numberFormat } from '@/lib/numbers';
import { quizFailureKey } from '@/lib/quiz-errors';

const typeKey = {
  SINGLE: 'typeSingle',
  MULTIPLE: 'typeMultiple',
  TRUE_FALSE: 'typeTrueFalse',
} as const;

/** The quiz's questions in order, with reorder and an inline editor. */
export function QuestionsList({
  locale,
  questions,
  quizId,
}: {
  locale: Locale;
  quizId: string;
  questions: AdminQuestion[];
}): React.JSX.Element {
  const t = useTranslations('Admin.quiz');
  const tLife = useTranslations('Admin.lifecycle');
  const errorText = useQuizErrorText();
  const router = useRouter();
  const pathname = usePathname();
  const nf = numberFormat(locale);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<AdminQuestion | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const signIn = (): void =>
    router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}`);

  const { errorKey, items, move, moved, pending } = useReorder(questions, {
    url: `/api/v1/admin/quizzes/${quizId}/questions/order`,
    parse: (data) => {
      const parsed = adminQuizDetailSchema.safeParse(data);
      return parsed.success ? parsed.data.questions : null;
    },
    onUnauthenticated: signIn,
  });

  function saved(): void {
    setOpen(null);
    setStatus(t('questionSaved'));
    router.refresh();
  }

  async function confirmDelete(): Promise<void> {
    if (!toDelete || deleting) return;
    setDeleting(true);
    setDialogError(null);
    const result = await apiFetch<void>(
      `/api/v1/admin/questions/${toDelete.id}`,
      { method: 'DELETE' },
    );
    setDeleting(false);
    if (!result.ok) {
      const key = await quizFailureKey(result);
      if (key === 'unauthenticated') return signIn();
      setDialogError(errorText(key));
      return;
    }
    dialogRef.current?.close();
    setToDelete(null);
    setOpen(null);
    setStatus(t('questionDeleted'));
    router.refresh();
  }

  function correctSummary(question: AdminQuestion): string {
    if (question.type === QuestionType.TRUE_FALSE) {
      return question.options[0]?.isCorrect
        ? t('answerTrue')
        : t('answerFalse');
    }
    return question.options
      .filter((option) => option.isCorrect)
      .map((option) => pick(option.text, locale))
      .join(' · ');
  }

  return (
    <div>
      {errorKey ? (
        <div className="mb-6">
          <FormAlert>{errorText(errorKey)}</FormAlert>
        </div>
      ) : null}
      <p role="status" className="sr-only">
        {moved
          ? t('questionMovedTo', { position: nf.format(moved.position) })
          : ''}
      </p>

      {items.length === 0 ? (
        <p className="text-cobalt">{t('noQuestions')}</p>
      ) : (
        <ol
          aria-label={t('questionsLabel')}
          data-testid="questions-list"
          className="border-t-2 border-cobalt"
        >
          {items.map((question, index) => {
            const prompt = pick(question.prompt, locale);
            const isOpen = open === question.id;
            return (
              <li
                key={question.id}
                data-reorder-id={question.id}
                data-question-row=""
                className="border-b border-wash"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular text-cobalt">
                      {t('questionNumber', { n: nf.format(index + 1) })} ·{' '}
                      {t(typeKey[question.type])}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-deep">
                      {prompt}
                      {question.hanzi ? (
                        <>
                          {' '}
                          <span lang="zh" className="font-normal text-cobalt">
                            {question.hanzi}
                          </span>
                        </>
                      ) : null}
                    </p>
                    <p className="mt-1 text-sm tabular text-cobalt">
                      {t('questionMeta', {
                        points: nf.format(question.points),
                        count: question.options.length,
                        n: nf.format(question.options.length),
                      })}
                    </p>
                    <p className="mt-1 inline-flex items-start gap-1.5 text-sm font-semibold text-deep">
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0"
                        strokeWidth={3}
                      />
                      <span>
                        {t('correctLabel')}: {correctSummary(question)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => {
                        setStatus(null);
                        setOpen(isOpen ? null : question.id);
                      }}
                      className={secondaryButton}
                    >
                      {isOpen ? t('closeEditor') : t('edit')}
                    </button>
                    <button
                      type="button"
                      data-move="up"
                      disabled={pending || index === 0}
                      aria-label={t('questionMoveUp', {
                        n: nf.format(index + 1),
                      })}
                      onClick={() => void move(index, -1)}
                      className={roundIconButton}
                    >
                      <ChevronUp aria-hidden="true" className="size-5" />
                    </button>
                    <button
                      type="button"
                      data-move="down"
                      disabled={pending || index === items.length - 1}
                      aria-label={t('questionMoveDown', {
                        n: nf.format(index + 1),
                      })}
                      onClick={() => void move(index, 1)}
                      className={roundIconButton}
                    >
                      <ChevronDown aria-hidden="true" className="size-5" />
                    </button>
                  </div>
                </div>
                {isOpen ? (
                  <div className="pb-6">
                    <QuestionEditor
                      locale={locale}
                      quizId={quizId}
                      question={question}
                      onCancel={() => setOpen(null)}
                      onSaved={saved}
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setToDelete(question);
                          setDialogError(null);
                          dialogRef.current?.showModal();
                        }}
                        className={secondaryButton}
                      >
                        {t('deleteQuestion')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-6 space-y-3">
        {open === 'new' ? (
          <QuestionEditor
            locale={locale}
            quizId={quizId}
            onCancel={() => setOpen(null)}
            onSaved={saved}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setStatus(null);
              setOpen('new');
            }}
            className={`${primaryButton} gap-2`}
          >
            <Plus aria-hidden="true" className="size-5" />
            {t('addQuestion')}
          </button>
        )}
        <StatusLine message={status} />
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="q-delete-title"
        aria-describedby="q-delete-body"
        onClose={() => setToDelete(null)}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-glaze-bright p-6 text-deep backdrop:bg-deep/60 sm:p-8"
      >
        <h2 id="q-delete-title" className="font-display text-3xl leading-tight">
          {t('deleteQuestionTitle')}
        </h2>
        <p id="q-delete-body" className="mt-4 leading-[1.8] text-cobalt">
          {t('deleteQuestionBody')}
        </p>
        {dialogError ? (
          <div className="mt-4">
            <FormAlert>{dialogError}</FormAlert>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <button
            type="button"
            disabled={deleting}
            onClick={() => dialogRef.current?.close()}
            className={secondaryButton}
          >
            {tLife('cancel')}
          </button>
          <button
            type="button"
            disabled={deleting}
            aria-busy={deleting}
            onClick={() => void confirmDelete()}
            className={primaryButton}
          >
            {deleting ? tLife('deleting') : tLife('confirmDelete')}
          </button>
        </div>
      </dialog>
    </div>
  );
}
