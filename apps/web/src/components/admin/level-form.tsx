'use client';

import { Plus, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import {
  MAX_LEVEL_TOPICS,
  adminLevelSchema,
  type AdminLevel,
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
import {
  ImageUpload,
  type AttachedImage,
} from '@/components/admin/image-upload';
import {
  buildLevelPayload,
  type FieldErrors,
  type LevelFormValues,
  type TopicRow,
} from '@/lib/admin-forms';
import { failureKey } from '@/lib/admin-client';
import { apiFetchParsed, jsonRequest } from '@/lib/api-client';
import { emptyLocalizedInput, toLocalizedInput } from '@/lib/localized';

let topicCounter = 0;
const newTopic = (values = emptyLocalizedInput): TopicRow => ({
  key: `topic-${(topicCounter += 1)}`,
  ...values,
});

function createSlug(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${base || 'level'}-${crypto.randomUUID().slice(0, 8)}`;
}

function initialValues(level: AdminLevel | undefined): LevelFormValues {
  return {
    slug: level?.slug ?? '',
    hanzi: level?.hanzi ?? '',
    title: toLocalizedInput(level?.title),
    summary: toLocalizedInput(level?.summary),
    topics: (level?.topics ?? []).map((topic) =>
      newTopic(toLocalizedInput(topic)),
    ),
    coverImageId: level?.coverImageId ?? null,
  };
}

export function LevelForm({
  level,
  locale,
}: {
  /** Present when editing; absent when creating. */
  level?: AdminLevel;
  locale: Locale;
}): React.JSX.Element {
  const t = useTranslations('Admin.form');
  const tFieldErrors = useTranslations('Admin.fieldErrors');
  const tErrors = useTranslations('Admin.errors');
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const [values, setValues] = useState(() => initialValues(level));
  const [cover, setCover] = useState<AttachedImage | null>(
    level?.coverImage && level.coverImageId
      ? { id: level.coverImageId, ...level.coverImage }
      : null,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [focusTick, setFocusTick] = useState(0);

  const isEdit = level !== undefined;
  const slugLocked = Boolean(level?.firstPublishedAt);
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

  // Focus the first invalid field, or the form-level alert, after render.
  useEffect(() => {
    if (focusTick === 0) return;
    const invalid = formRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    (invalid ?? alertRef.current)?.focus();
  }, [focusTick]);

  function update<K extends keyof LevelFormValues>(
    key: K,
    value: LevelFormValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setStatus(null);
    setFormError(null);

    const built = buildLevelPayload({
      ...values,
      slug: values.slug || createSlug(values.title.en),
      coverImageId: cover?.id ?? null,
    });
    if (!built.ok) {
      setErrors(built.errors);
      setFormError(t('invalid'));
      setFocusTick((tick) => tick + 1);
      return;
    }
    setErrors({});

    setPending(true);
    const { slug, ...rest } = built.payload;
    const result = await apiFetchParsed(
      isEdit ? `/api/v1/admin/levels/${level.id}` : '/api/v1/admin/levels',
      adminLevelSchema,
      jsonRequest(isEdit && slugLocked ? rest : { slug, ...rest }, {
        method: isEdit ? 'PATCH' : 'POST',
      }),
    );
    setPending(false);

    if (!result.ok) {
      const key = await failureKey(result);
      if (key === 'unauthenticated') {
        router.replace(
          `/${locale}/admin/login?next=${encodeURIComponent(pathname)}`,
        );
        return;
      }
      setFormError(tErrors(key));
      setFocusTick((tick) => tick + 1);
      return;
    }

    if (!isEdit) {
      router.push(`/${locale}/admin/levels/${result.data.id}`);
      router.refresh();
      return;
    }
    setStatus(t('saved'));
    router.refresh();
  }

  const topicsFull = values.topics.length >= MAX_LEVEL_TOPICS;

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

      <div className="max-w-[34rem]">
        <TextField
          id="level-hanzi"
          label={t('hanzi')}
          helper={t('hanziHelper')}
          value={values.hanzi}
          lang="zh"
          error={message('hanzi')}
          onChange={(value) => update('hanzi', value)}
        />
      </div>

      <LocalizedFieldset
        idPrefix="level-title"
        legend={t('title')}
        helper={t('localizedHelper')}
        names={names}
        values={values.title}
        errors={localizedErrors('title')}
        onChange={(next) => update('title', next)}
      />

      <LocalizedFieldset
        idPrefix="level-summary"
        legend={t('summary')}
        multiline
        names={names}
        values={values.summary}
        errors={localizedErrors('summary')}
        onChange={(next) => update('summary', next)}
      />

      <fieldset className="min-w-0">
        <legend className="text-sm font-semibold text-deep">
          {t('topics')}
        </legend>
        <p className="mt-1 text-sm text-cobalt">{t('topicsHelper')}</p>
        <ol className="mt-4 space-y-6">
          {values.topics.map((topic, index) => (
            <li key={topic.key} className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <LocalizedFieldset
                  idPrefix={`level-topic-${index}`}
                  legend={t('topic', { n: index + 1 })}
                  names={names}
                  values={topic}
                  errors={localizedErrors(`topics.${index}`)}
                  onChange={(next) =>
                    update(
                      'topics',
                      values.topics.map((row) =>
                        row.key === topic.key ? { ...row, ...next } : row,
                      ),
                    )
                  }
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  update(
                    'topics',
                    values.topics.filter((row) => row.key !== topic.key),
                  )
                }
                aria-label={t('removeTopic', { n: index + 1 })}
                className="mt-7 grid size-11 shrink-0 place-items-center rounded-full text-cobalt transition-colors hover:bg-glaze-shade hover:text-deep"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={topicsFull}
            onClick={() => update('topics', [...values.topics, newTopic()])}
            className={`${secondaryButton} gap-2`}
          >
            <Plus aria-hidden="true" className="size-5" />
            {t('addTopic')}
          </button>
          {topicsFull ? (
            <p className="text-sm text-cobalt">{t('topicsFull')}</p>
          ) : null}
        </div>
      </fieldset>

      <ImageUpload
        id="level-cover"
        label={t('cover')}
        helper={t('coverHelper')}
        value={cover}
        onChange={setCover}
        onUnauthenticated={() =>
          router.replace(
            `/${locale}/admin/login?next=${encodeURIComponent(pathname)}`,
          )
        }
      />

      <div className="space-y-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={`${primaryButton} w-full sm:w-auto`}
        >
          {pending ? t('saving') : isEdit ? t('saveLevel') : t('createLevel')}
        </button>
        <StatusLine message={status} />
      </div>
    </form>
  );
}
