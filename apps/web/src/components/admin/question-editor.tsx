'use client';

import { Plus, Trash2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import {
  MAX_QUESTION_OPTIONS,
  MIN_QUESTION_OPTIONS,
  QuestionType,
  type AdminQuestion,
  type Locale,
} from '@app/shared';

import { FormAlert } from '@/components/auth/form-controls';
import {
  LocalizedFieldset,
  TextField,
  primaryButton,
  roundIconButton,
  secondaryButton,
  type LocaleNames,
} from '@/components/admin/controls';
import {
  ImageUpload,
  type AttachedImage,
} from '@/components/admin/image-upload';
import { useQuizErrorText } from '@/components/admin/use-quiz-error';
import type { FieldErrors } from '@/lib/admin-forms';
import { numberFormat } from '@/lib/numbers';
import { apiFetch, jsonRequest } from '@/lib/api-client';
import {
  blankOption,
  blankQuestion,
  buildQuestionPayload,
  valuesFromQuestion,
  withType,
  type QuestionFormValues,
  type RuleError,
} from '@/lib/question-editor';
import { quizFailureKey } from '@/lib/quiz-errors';

const types = [
  QuestionType.SINGLE,
  QuestionType.MULTIPLE,
  QuestionType.TRUE_FALSE,
] as const;

const typeKey = {
  SINGLE: 'typeSingle',
  MULTIPLE: 'typeMultiple',
  TRUE_FALSE: 'typeTrueFalse',
} as const;

/**
 * Create or edit one question. Saving replaces the options on the server, so
 * the caller re-fetches the quiz afterwards (`onSaved`): option ids are never
 * kept across saves, only the client-side row keys.
 */
export function QuestionEditor({
  locale,
  onCancel,
  onSaved,
  question,
  quizId,
}: {
  locale: Locale;
  quizId: string;
  question?: AdminQuestion;
  onCancel: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const t = useTranslations('Admin.quiz');
  const tForm = useTranslations('Admin.form');
  const tFieldErrors = useTranslations('Admin.fieldErrors');
  const errorText = useQuizErrorText();
  const router = useRouter();
  const pathname = usePathname();
  const alertRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<QuestionFormValues>(() =>
    question ? valuesFromQuestion(question) : blankQuestion(),
  );
  const [image, setImage] = useState<AttachedImage | null>(
    question?.image ?? null,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [rules, setRules] = useState<RuleError[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showInvalid, setShowInvalid] = useState(false);

  const nf = numberFormat(locale);
  const uid = question?.id ?? 'new';
  const names: LocaleNames = {
    ar: tForm('langAr'),
    en: tForm('langEn'),
    zh: tForm('langZh'),
  };
  const isTrueFalse = values.type === QuestionType.TRUE_FALSE;
  const multiple = values.type === QuestionType.MULTIPLE;
  const message = (key: string): string | undefined =>
    errors[key] ? tFieldErrors(errors[key]) : undefined;
  const localized = (prefix: string) => ({
    ar: message(`${prefix}.ar`),
    en: message(`${prefix}.en`),
    zh: message(`${prefix}.zh`),
  });
  const signIn = (): void =>
    router.replace(
      `/${locale}/admin/login?next=${encodeURIComponent(pathname)}`,
    );

  function update(patch: Partial<QuestionFormValues>): void {
    setValues((current) => ({ ...current, ...patch }));
  }

  function setCorrect(index: number, checked: boolean): void {
    setValues((current) => ({
      ...current,
      options: current.options.map((option, i) => ({
        ...option,
        isCorrect:
          current.type === QuestionType.MULTIPLE
            ? i === index
              ? checked
              : option.isCorrect
            : i === index,
      })),
    }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setServerError(null);
    const built = buildQuestionPayload({
      ...values,
      imageId: image?.id ?? null,
    });
    if (!built.ok) {
      setErrors(built.errors);
      setRules(built.rules);
      setShowInvalid(true);
      requestAnimationFrame(() => alertRef.current?.focus());
      return;
    }
    setErrors({});
    setRules([]);
    setShowInvalid(false);

    setPending(true);
    const result = await apiFetch<unknown>(
      question
        ? `/api/v1/admin/questions/${question.id}`
        : `/api/v1/admin/quizzes/${quizId}/questions`,
      jsonRequest(built.payload, { method: question ? 'PUT' : 'POST' }),
    );
    setPending(false);
    if (!result.ok) {
      const key = await quizFailureKey(result);
      if (key === 'unauthenticated') return signIn();
      setServerError(errorText(key));
      requestAnimationFrame(() => alertRef.current?.focus());
      return;
    }
    onSaved();
  }

  const hasErrors =
    showInvalid && (rules.length > 0 || Object.keys(errors).length > 0);
  const alertBody = serverError ? (
    serverError
  ) : hasErrors ? (
    <>
      <span className="block">{t('fixFields')}</span>
      {rules.length > 0 ? (
        <ul className="mt-2 list-disc ps-5 font-normal">
          {rules.map((rule) => (
            <li key={rule}>{t(`rules.${rule}`)}</li>
          ))}
        </ul>
      ) : null}
    </>
  ) : null;

  return (
    <form
      noValidate
      aria-busy={pending}
      aria-label={question ? t('editQuestion') : t('newQuestion')}
      onSubmit={(event) => void submit(event)}
      className="space-y-8 rounded-2xl bg-glaze p-5 sm:p-6"
    >
      {alertBody ? (
        <div ref={alertRef} tabIndex={-1}>
          <FormAlert>{alertBody}</FormAlert>
        </div>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-deep">
          {t('questionType')}
        </legend>
        <div className="flex flex-wrap gap-3">
          {types.map((type) => (
            <label
              key={type}
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-5 font-semibold has-[:focus-visible]:shadow-[0_0_0_5px_var(--color-cobalt-mid)] ${
                values.type === type
                  ? 'bg-deep text-glaze'
                  : 'border-[1.5px] border-wash-strong text-cobalt hover:border-cobalt'
              }`}
            >
              <input
                type="radio"
                name={`type-${uid}`}
                value={type}
                checked={values.type === type}
                onChange={() => setValues((current) => withType(current, type))}
                className="sr-only"
              />
              {t(typeKey[type])}
            </label>
          ))}
        </div>
      </fieldset>

      <LocalizedFieldset
        idPrefix={`q-prompt-${uid}`}
        legend={t('prompt')}
        helper={tForm('localizedHelper')}
        names={names}
        values={values.prompt}
        errors={localized('prompt')}
        onChange={(next) => update({ prompt: next })}
      />

      <div className="max-w-sm">
        <TextField
          id={`q-hanzi-${uid}`}
          label={t('hanzi')}
          helper={t('hanziHelper')}
          value={values.hanzi}
          lang="zh"
          error={message('hanzi')}
          onChange={(value) => update({ hanzi: value })}
        />
      </div>

      <ImageUpload
        id={`q-image-${uid}`}
        label={t('image')}
        helper={t('imageHelper')}
        value={image}
        onChange={setImage}
        onUnauthenticated={signIn}
      />

      {isTrueFalse ? (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-deep">
            {t('correctAnswer')}
          </legend>
          <div className="flex flex-wrap gap-6">
            {([true, false] as const).map((answer) => (
              <label
                key={String(answer)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-3 font-semibold text-deep"
              >
                <input
                  type="radio"
                  name={`tf-${uid}`}
                  checked={values.correctAnswer === answer}
                  onChange={() => update({ correctAnswer: answer })}
                  className="size-5 accent-deep"
                />
                {answer ? t('answerTrue') : t('answerFalse')}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <fieldset className="space-y-6">
          <legend className="text-sm font-semibold text-deep">
            {t('options')}
          </legend>
          <p className="text-sm text-cobalt">
            {multiple ? t('optionsHelperMultiple') : t('optionsHelperSingle')}{' '}
            {t('optionsRange', {
              min: nf.format(MIN_QUESTION_OPTIONS),
              max: nf.format(MAX_QUESTION_OPTIONS),
            })}
          </p>
          {values.options.map((option, index) => (
            <div
              key={option.key}
              data-option-row=""
              className="space-y-3 rounded-2xl border-[1.5px] border-wash p-4"
            >
              <LocalizedFieldset
                idPrefix={`q-opt-${uid}-${option.key}`}
                legend={t('optionN', { n: nf.format(index + 1) })}
                names={names}
                values={option.text}
                errors={
                  !option.text.en.trim() && showInvalid
                    ? { en: tFieldErrors('required') }
                    : undefined
                }
                onChange={(next) =>
                  update({
                    options: values.options.map((row) =>
                      row.key === option.key ? { ...row, text: next } : row,
                    ),
                  })
                }
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 font-semibold text-deep">
                  <input
                    type={multiple ? 'checkbox' : 'radio'}
                    name={`correct-${uid}`}
                    checked={option.isCorrect}
                    onChange={(event) =>
                      setCorrect(index, event.target.checked)
                    }
                    className="size-5 accent-deep"
                  />
                  {t('markCorrect', { n: nf.format(index + 1) })}
                </label>
                <button
                  type="button"
                  disabled={values.options.length <= MIN_QUESTION_OPTIONS}
                  aria-label={t('removeOption', { n: nf.format(index + 1) })}
                  onClick={() =>
                    update({
                      options: values.options.filter(
                        (row) => row.key !== option.key,
                      ),
                    })
                  }
                  className={roundIconButton}
                >
                  <Trash2 aria-hidden="true" className="size-5" />
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            disabled={values.options.length >= MAX_QUESTION_OPTIONS}
            onClick={() =>
              update({ options: [...values.options, blankOption()] })
            }
            className={`${secondaryButton} gap-2`}
          >
            <Plus aria-hidden="true" className="size-5" />
            {t('addOption')}
          </button>
        </fieldset>
      )}

      <LocalizedFieldset
        idPrefix={`q-expl-${uid}`}
        legend={t('explanation')}
        helper={t('explanationHelper')}
        multiline
        names={names}
        values={values.explanation}
        errors={localized('explanation')}
        onChange={(next) => update({ explanation: next })}
      />

      <div className="max-w-xs">
        <TextField
          id={`q-points-${uid}`}
          label={t('points')}
          helper={t('pointsHelper')}
          value={values.points}
          inputMode="numeric"
          error={message('points')}
          onChange={(value) => update({ points: value })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={`${primaryButton} w-full sm:w-auto`}
        >
          {pending ? tForm('saving') : t('saveQuestion')}
        </button>
        <button type="button" onClick={onCancel} className={secondaryButton}>
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}
