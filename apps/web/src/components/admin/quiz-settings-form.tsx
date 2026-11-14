'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import {
  adminQuizSummarySchema,
  type AdminQuizSummary,
  type Locale,
} from '@app/shared';

import { FormAlert } from '@/components/auth/form-controls';
import {
  LocalizedFieldset,
  StatusLine,
  TextField,
  primaryButton,
  secondaryButton,
  type LocaleNames,
} from '@/components/admin/controls';
import { useQuizErrorText } from '@/components/admin/use-quiz-error';
import {
  changedLocalizedFields,
  clearFieldErrors,
  type FieldErrors,
} from '@/lib/admin-forms';
import { apiFetchParsed, jsonRequest } from '@/lib/api-client';
import { quizFailureKey } from '@/lib/quiz-errors';
import { buildQuizPayload, quizFormValues } from '@/lib/quiz-forms';

/**
 * Create (title and pass mark, then on to the editor) or edit (title,
 * description, pass mark) one quiz.
 */
export function QuizSettingsForm({
  lessonId,
  locale,
  onCancel,
  quiz,
}: {
  lessonId: string;
  locale: Locale;
  quiz?: AdminQuizSummary;
  onCancel?: () => void;
}): React.JSX.Element {
  const t = useTranslations('Admin.quiz');
  const tForm = useTranslations('Admin.form');
  const tFieldErrors = useTranslations('Admin.fieldErrors');
  const errorText = useQuizErrorText();
  const router = useRouter();
  const pathname = usePathname();
  const isEdit = quiz !== undefined;

  const [values, setValues] = useState(() => quizFormValues(quiz));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const names: LocaleNames = {
    ar: tForm('langAr'),
    en: tForm('langEn'),
    zh: tForm('langZh'),
  };
  const message = (key: string): string | undefined =>
    errors[key] ? tFieldErrors(errors[key]) : undefined;
  const localized = (prefix: string) => ({
    ar: message(`${prefix}.ar`),
    en: message(`${prefix}.en`),
    zh: message(`${prefix}.zh`),
  });
  function clearChanged(fields: string[]): void {
    setErrors((current) => clearFieldErrors(current, fields));
  }
  useEffect(() => {
    if (Object.keys(errors).length === 0) setFormError(null);
  }, [errors]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setStatus(null);
    setFormError(null);
    const built = buildQuizPayload(values);
    if (!built.ok) {
      setErrors(built.errors);
      setFormError(tForm('invalid'));
      return;
    }
    setErrors({});
    setPending(true);
    const result = await apiFetchParsed(
      isEdit
        ? `/api/v1/admin/quizzes/${quiz.id}`
        : `/api/v1/admin/lessons/${lessonId}/quizzes`,
      adminQuizSummarySchema,
      jsonRequest(built.payload, { method: isEdit ? 'PATCH' : 'POST' }),
    );
    setPending(false);
    if (!result.ok) {
      const key = await quizFailureKey(result);
      if (key === 'unauthenticated') {
        router.replace(
          `/${locale}/admin/login?next=${encodeURIComponent(pathname)}`,
        );
        return;
      }
      setFormError(errorText(key));
      return;
    }
    if (!isEdit) {
      router.push(`/${locale}/admin/quizzes/${result.data.id}`);
      router.refresh();
      return;
    }
    setStatus(tForm('saved'));
    router.refresh();
  }

  return (
    <form
      noValidate
      aria-busy={pending}
      onSubmit={(event) => void submit(event)}
      className="space-y-8"
    >
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <LocalizedFieldset
        idPrefix={`quiz-title-${quiz?.id ?? 'new'}`}
        legend={t('quizTitle')}
        helper={tForm('localizedHelper')}
        names={names}
        values={values.title}
        errors={localized('title')}
        onChange={(next) => {
          clearChanged(changedLocalizedFields('title', values.title, next));
          setValues((v) => ({ ...v, title: next }));
        }}
      />
      {isEdit ? (
        <LocalizedFieldset
          idPrefix={`quiz-description-${quiz.id}`}
          legend={tForm('description')}
          multiline
          names={names}
          values={values.description}
          errors={localized('description')}
          onChange={(next) => {
            clearChanged(
              changedLocalizedFields('description', values.description, next),
            );
            setValues((v) => ({ ...v, description: next }));
          }}
        />
      ) : null}
      <div className="max-w-xs">
        <TextField
          id={`quiz-pass-${quiz?.id ?? 'new'}`}
          label={t('passMark')}
          helper={t('passMarkHelper')}
          value={values.passingScore}
          inputMode="numeric"
          error={message('passingScore')}
          onChange={(value) => {
            clearChanged(['passingScore']);
            setValues((v) => ({ ...v, passingScore: value }));
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={`${primaryButton} w-full sm:w-auto`}
        >
          {pending ? tForm('saving') : isEdit ? t('saveQuiz') : t('createQuiz')}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={secondaryButton}>
            {t('cancel')}
          </button>
        ) : null}
      </div>
      <StatusLine message={status} />
    </form>
  );
}
