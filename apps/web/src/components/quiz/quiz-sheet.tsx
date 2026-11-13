'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import {
  QuestionType,
  submitAttemptResponseSchema,
  type LearnerQuiz,
  type Locale,
} from '@app/shared';

import { primaryButton, secondaryButton } from '@/components/admin/controls';
import { FieldErrorMessage, FormAlert } from '@/components/auth/form-controls';
import { AttemptResult } from '@/components/quiz/attempt-result';
import { OptionRow } from '@/components/quiz/option-row';
import { QuestionBody } from '@/components/quiz/question-head';
import { apiFetchParsed, jsonRequest } from '@/lib/api-client';
import { pick } from '@/lib/localized';
import { numberFormat } from '@/lib/numbers';
import {
  answeredCount,
  clearDraft,
  issueQuestionIds,
  loadDraft,
  saveDraft,
  toAnswers,
  toggleOption,
  type Draft,
} from '@/lib/quiz-answers';
import { reviewFromSubmit, type ReviewModel } from '@/lib/quiz-review';

type FormError = 'tooMany' | 'network' | 'generic' | 'unanswered' | null;

async function readBody(response: Response | undefined): Promise<unknown> {
  try {
    return response ? await response.clone().json() : null;
  } catch {
    return null;
  }
}

/** The exam sheet, and (after submit) the result and review in its place. */
export function QuizSheet({
  lessonHref,
  nextLessonHref,
  levelHref,
  loginHref,
  quiz,
}: {
  quiz: LearnerQuiz;
  lessonHref: string;
  nextLessonHref: string | null;
  levelHref: string;
  loginHref: string;
}): React.JSX.Element {
  const t = useTranslations('Quiz');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const nf = numberFormat(locale);
  const total = quiz.questions.length;

  const [draft, setDraft] = useState<Draft>({});
  const [restored, setRestored] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<FormError>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [review, setReview] = useState<ReviewModel | null>(null);
  const sheetRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);

  // Restore after mount so the server and first client render agree.
  const didRestore = useRef(false);
  useEffect(() => {
    if (didRestore.current) return;
    didRestore.current = true;
    setDraft(loadDraft(quiz));
    setRestored(true);
  }, [quiz]);

  useEffect(() => {
    if (restored && !review) saveDraft(quiz.id, draft);
  }, [draft, restored, review, quiz.id]);

  const answered = answeredCount(quiz, draft);
  const complete = answered === total;

  function choose(questionId: string, type: QuestionType, optionId: string) {
    setDraft((current) => ({
      ...current,
      [questionId]: toggleOption(type, current[questionId] ?? [], optionId),
    }));
    setIssues((current) => current.filter((id) => id !== questionId));
    setFormError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || pending) return;
    if (!complete) {
      setFormError('unanswered');
      return;
    }
    submitting.current = true;
    setPending(true);
    setFormError(null);
    setIssues([]);

    const result = await apiFetchParsed(
      `/api/v1/quizzes/${quiz.id}/attempts`,
      submitAttemptResponseSchema,
      jsonRequest({ answers: toAnswers(quiz, draft) }, { method: 'POST' }),
    );
    submitting.current = false;
    setPending(false);

    if (!result.ok) {
      if (result.kind === 'unauthenticated') {
        router.replace(loginHref);
        return;
      }
      if (result.status === 429) return setFormError('tooMany');
      if (result.status === 0) return setFormError('network');
      if (result.status === 400) {
        const ids = issueQuestionIds(await readBody(result.response));
        if (ids.length > 0) {
          setIssues(ids);
          requestAnimationFrame(() =>
            sheetRef.current
              ?.querySelector<HTMLElement>(`[data-question="${ids[0]}"] input`)
              ?.focus(),
          );
          return;
        }
      }
      return setFormError('generic');
    }
    clearDraft(quiz.id);
    setReview(reviewFromSubmit(quiz, result.data));
    router.refresh();
  }

  function tryAgain() {
    setReview(null);
    setDraft({});
    setIssues([]);
    setFormError(null);
    requestAnimationFrame(() => {
      sheetRef.current?.querySelector<HTMLElement>('input')?.focus();
      window.scrollTo({ top: 0 });
    });
  }

  if (review) {
    return (
      <div>
        <div aria-live="polite">
          <AttemptResult model={review} focusHeading />
        </div>
        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3">
          {review.passed ? (
            <Link href={nextLessonHref ?? levelHref} className={primaryButton}>
              {nextLessonHref ? t('nextLesson') : t('backToLevel')}
            </Link>
          ) : (
            <button type="button" onClick={tryAgain} className={primaryButton}>
              {t('tryAgain')}
            </button>
          )}
          {review.passed ? (
            <button
              type="button"
              onClick={tryAgain}
              className="min-h-11 text-sm text-cobalt underline decoration-wash-strong underline-offset-4 hover:text-deep"
            >
              {t('tryAgain')}
            </button>
          ) : null}
          <Link href={lessonHref} className={secondaryButton}>
            {t('backToLesson')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={sheetRef}
      noValidate
      aria-busy={pending}
      onSubmit={(event) => void submit(event)}
    >
      <div className="space-y-12">
        {quiz.questions.map((question, index) => {
          const multiple = question.type === QuestionType.MULTIPLE;
          const invalid = issues.includes(question.id);
          const helperId = `q-${question.id}-help`;
          const errorId = `q-${question.id}-error`;
          const describedBy =
            [multiple ? helperId : null, invalid ? errorId : null]
              .filter(Boolean)
              .join(' ') || undefined;
          return (
            <fieldset
              key={question.id}
              data-question={question.id}
              aria-describedby={describedBy}
              aria-invalid={invalid ? 'true' : undefined}
              className="min-w-0"
            >
              <legend className="w-full">
                <span className="block text-sm tabular text-cobalt">
                  {t('questionOf', {
                    n: nf.format(index + 1),
                    total: nf.format(total),
                  })}
                </span>
                <QuestionBody
                  prompt={pick(question.prompt, locale)}
                  hanzi={question.hanzi}
                  image={question.image}
                />
              </legend>
              {multiple ? (
                <p id={helperId} className="mt-3 text-sm text-cobalt">
                  {t('chooseAll')}
                </p>
              ) : null}
              <div className="mt-4 space-y-3">
                {question.options.map((option) => (
                  <OptionRow
                    key={option.id}
                    id={`opt-${option.id}`}
                    name={`q-${question.id}`}
                    type={question.type}
                    text={pick(option.text, locale)}
                    checked={draft[question.id]?.includes(option.id) ?? false}
                    onChange={() =>
                      choose(question.id, question.type, option.id)
                    }
                  />
                ))}
              </div>
              {invalid ? (
                <FieldErrorMessage id={errorId} message={t('issueMessage')} />
              ) : null}
            </fieldset>
          );
        })}
      </div>

      <div className="mt-12 space-y-4 border-t-2 border-cobalt pt-6">
        {formError ? (
          <FormAlert>
            {formError === 'tooMany'
              ? t('errorTooMany')
              : formError === 'network'
                ? t('errorNetwork')
                : formError === 'unanswered'
                  ? t('errorUnanswered')
                  : t('errorGeneric')}
          </FormAlert>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <p data-testid="answered-count" className="tabular text-cobalt">
            {t('answered', { n: nf.format(answered), total: nf.format(total) })}
          </p>
          <button
            type="submit"
            disabled={!complete || pending}
            aria-busy={pending}
            className={`${primaryButton} w-full sm:w-auto`}
          >
            {pending ? t('submitting') : t('submit')}
          </button>
        </div>
      </div>
    </form>
  );
}
