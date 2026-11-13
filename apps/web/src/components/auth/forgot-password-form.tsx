'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  forgotPasswordRequestSchema,
  type ForgotPasswordRequest,
  type Locale,
  type z,
} from '@app/shared';

import {
  FormAlert,
  FormField,
  SubmitButton,
  secondaryLink,
} from '@/components/auth/form-controls';
import { apiFetch, jsonRequest } from '@/lib/api-client';
import { authErrorKey, type AuthErrorKey } from '@/lib/auth-errors';

type ForgotInput = z.input<typeof forgotPasswordRequestSchema>;

export function ForgotPasswordForm({
  locale,
  portal = 'student',
}: {
  locale: Locale;
  portal?: 'admin' | 'student';
}): React.JSX.Element {
  const t = useTranslations('Auth');
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<ForgotInput, unknown, ForgotPasswordRequest>({
    resolver: zodResolver(forgotPasswordRequestSchema),
    defaultValues: { locale, portal },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await apiFetch<void>(
      '/api/v1/auth/forgot-password',
      jsonRequest({ ...values, locale, portal }, { method: 'POST' }),
    );
    if (!result.ok) {
      setFormError(authErrorKey(result.status, 'generic'));
      return;
    }
    setSent(true);
  });

  if (sent) {
    return (
      <div className="space-y-6">
        <FormAlert>{t('forgotConfirmation')}</FormAlert>
        <Link
          href={
            portal === 'admin' ? `/${locale}/admin/login` : `/${locale}/login`
          }
          className={secondaryLink}
        >
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-6">
      {formError ? <FormAlert>{t(formError)}</FormAlert> : null}
      <FormField
        id="forgot-email"
        type="email"
        label={t('email')}
        autoComplete="email"
        error={errors.email}
        errorMessage={t('validationEmail')}
        registration={register('email')}
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <SubmitButton
          label={t('forgotSubmit')}
          pending={isSubmitting}
          pendingLabel={t('forgotPending')}
        />
        <Link
          href={
            portal === 'admin' ? `/${locale}/admin/login` : `/${locale}/login`
          }
          className={secondaryLink}
        >
          {t('backToLogin')}
        </Link>
      </div>
    </form>
  );
}
