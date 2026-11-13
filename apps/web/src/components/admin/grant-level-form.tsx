'use client';

import { CircleAlert } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { FormAlert, baseInput } from '@/components/auth/form-controls';
import {
  StatusLine,
  labelClass,
  primaryButton,
} from '@/components/admin/controls';
import { failureKey } from '@/lib/admin-client';
import { apiFetch, jsonRequest } from '@/lib/api-client';

export interface GrantOption {
  id: string;
  label: string;
}

export function GrantLevelForm({
  locale,
  options,
  studentId,
}: {
  locale: string;
  studentId: string;
  options: GrantOption[];
}): React.JSX.Element {
  const t = useTranslations('Admin.student');
  const tErrors = useTranslations('Admin.errors');
  const router = useRouter();
  const pathname = usePathname();
  const [levelId, setLevelId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  if (options.length === 0) {
    return <p className="text-cobalt">{t('grantNone')}</p>;
  }

  async function submit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setStatus(null);
    if (!levelId) {
      setFieldError(t('grantChoose'));
      return;
    }
    setFieldError(null);
    setPending(true);
    const result = await apiFetch<unknown>(
      `/api/v1/admin/students/${studentId}/enrollments`,
      jsonRequest({ levelId }, { method: 'POST' }),
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
      setError(tErrors(key));
      return;
    }
    setLevelId('');
    setStatus(t('granted'));
    router.refresh();
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="max-w-[34rem] space-y-4"
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div>
        <label htmlFor="grant-level" className={labelClass}>
          {t('grantLabel')}
        </label>
        <select
          id="grant-level"
          value={levelId}
          onChange={(event) => setLevelId(event.target.value)}
          aria-invalid={fieldError ? 'true' : undefined}
          aria-describedby={fieldError ? 'grant-level-error' : undefined}
          className={`${baseInput} ${
            fieldError
              ? 'border-2 border-deep'
              : 'border-[1.5px] border-wash-strong'
          }`}
        >
          <option value="">{t('grantPlaceholder')}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {fieldError ? (
          <p
            id="grant-level-error"
            className="mt-2 flex items-start gap-2 text-sm font-semibold text-deep"
          >
            <CircleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <span>{fieldError}</span>
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={`${primaryButton} w-full sm:w-auto`}
      >
        {pending ? t('granting') : t('grantSubmit')}
      </button>
      <StatusLine message={status} />
    </form>
  );
}
