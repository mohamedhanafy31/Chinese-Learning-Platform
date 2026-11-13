'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { adminLessonSchema, type AdminLesson, type Locale } from '@app/shared';

import { FormAlert } from '@/components/auth/form-controls';
import {
  CheckboxField,
  LocalizedFieldset,
  StatusLine,
  TextField,
  primaryButton,
  type LocaleNames,
} from '@/components/admin/controls';
import {
  ImageUpload,
  type AttachedImage,
} from '@/components/admin/image-upload';
import {
  buildLessonPayload,
  type FieldErrors,
  type LessonFormValues,
} from '@/lib/admin-forms';
import { failureKey } from '@/lib/admin-client';
import { apiFetchParsed, jsonRequest } from '@/lib/api-client';
import { toLocalizedInput } from '@/lib/localized';

function initialValues(lesson: AdminLesson | undefined): LessonFormValues {
  return {
    title: toLocalizedInput(lesson?.title),
    description: toLocalizedInput(lesson?.description),
    hanzi: lesson?.hanzi ?? '',
    isFreePreview: lesson?.isFreePreview ?? false,
    thumbnailId: lesson?.thumbnailId ?? null,
  };
}

export function LessonForm({
  levelId,
  lesson,
  locale,
}: {
  /** The level a new lesson is added to (also set when editing). */
  levelId: string;
  /** Present when editing; absent when creating. */
  lesson?: AdminLesson;
  locale: Locale;
}): React.JSX.Element {
  const t = useTranslations('Admin.form');
  const tFieldErrors = useTranslations('Admin.fieldErrors');
  const tErrors = useTranslations('Admin.errors');
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const [values, setValues] = useState(() => initialValues(lesson));
  const [thumbnail, setThumbnail] = useState<AttachedImage | null>(
    lesson?.thumbnail && lesson.thumbnailId
      ? { id: lesson.thumbnailId, ...lesson.thumbnail }
      : null,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [focusTick, setFocusTick] = useState(0);

  const isEdit = lesson !== undefined;
  const names: LocaleNames = {
    ar: t('langAr'),
    en: t('langEn'),
    zh: t('langZh'),
  };
  const message = (key: string): string | undefined => {
    const code = errors[key];
    return code ? tFieldErrors(code) : undefined;
  };
  const localizedErrors = (prefix: string) => ({
    ar: message(`${prefix}.ar`),
    en: message(`${prefix}.en`),
    zh: message(`${prefix}.zh`),
  });
  const signIn = (): void =>
    router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}`);

  useEffect(() => {
    if (focusTick === 0) return;
    const invalid = formRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    (invalid ?? alertRef.current)?.focus();
  }, [focusTick]);

  function update<K extends keyof LessonFormValues>(
    key: K,
    value: LessonFormValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setStatus(null);
    setFormError(null);

    const built = buildLessonPayload({
      ...values,
      thumbnailId: thumbnail?.id ?? null,
    });
    if (!built.ok) {
      setErrors(built.errors);
      setFormError(t('invalid'));
      setFocusTick((tick) => tick + 1);
      return;
    }
    setErrors({});

    setPending(true);
    const result = await apiFetchParsed(
      isEdit
        ? `/api/v1/admin/lessons/${lesson.id}`
        : `/api/v1/admin/levels/${levelId}/lessons`,
      adminLessonSchema,
      jsonRequest(built.payload, { method: isEdit ? 'PATCH' : 'POST' }),
    );
    setPending(false);

    if (!result.ok) {
      const key = await failureKey(result);
      if (key === 'unauthenticated') return signIn();
      setFormError(tErrors(key));
      setFocusTick((tick) => tick + 1);
      return;
    }

    if (!isEdit) {
      router.push(`/${locale}/admin/lessons/${result.data.id}`);
      router.refresh();
      return;
    }
    setStatus(t('saved'));
    router.refresh();
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-busy={pending}
      className="space-y-10"
    >
      {formError ? (
        <div ref={alertRef} tabIndex={-1}>
          <FormAlert>{formError}</FormAlert>
        </div>
      ) : null}

      <LocalizedFieldset
        idPrefix="lesson-title"
        legend={t('lessonTitle')}
        helper={t('localizedHelper')}
        names={names}
        values={values.title}
        errors={localizedErrors('title')}
        onChange={(next) => update('title', next)}
      />

      <LocalizedFieldset
        idPrefix="lesson-description"
        legend={t('description')}
        multiline
        names={names}
        values={values.description}
        errors={localizedErrors('description')}
        onChange={(next) => update('description', next)}
      />

      <div className="max-w-sm">
        <TextField
          id="lesson-hanzi"
          label={t('lessonHanzi')}
          helper={t('lessonHanziHelper')}
          value={values.hanzi}
          lang="zh"
          error={message('hanzi')}
          onChange={(value) => update('hanzi', value)}
        />
      </div>

      <CheckboxField
        id="lesson-free-preview"
        label={t('freePreviewLabel')}
        helper={t('freePreviewHelper')}
        checked={values.isFreePreview}
        onChange={(checked) => update('isFreePreview', checked)}
      />

      <ImageUpload
        id="lesson-thumbnail"
        label={t('thumbnail')}
        helper={t('thumbnailHelper')}
        value={thumbnail}
        onChange={setThumbnail}
        onUnauthenticated={signIn}
      />

      <div className="space-y-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={`${primaryButton} w-full sm:w-auto`}
        >
          {pending ? t('saving') : isEdit ? t('saveLesson') : t('createLesson')}
        </button>
        <StatusLine message={status} />
      </div>
    </form>
  );
}
