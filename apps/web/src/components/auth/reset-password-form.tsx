'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { resetPasswordRequestSchema, z, type Locale } from '@app/shared';

import {
  FormAlert,
  PasswordField,
  SubmitButton,
  secondaryLink,
} from '@/components/auth/form-controls';
import { apiFetch, jsonRequest } from '@/lib/api-client';
import { authErrorKey, type AuthErrorKey } from '@/lib/auth-errors';

const resetFormSchema = resetPasswordRequestSchema
  .pick({ password: true })
  .extend({ confirmPassword: z.string().min(1) })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
  });

type ResetForm = z.infer<typeof resetFormSchema>;

export function ResetPasswordForm({
  locale,
  portal = 'student',
  token,
}: {
  locale: Locale;
  portal?: 'admin' | 'student';
  token: string;
}): React.JSX.Element {
  const t = useTranslations('Auth');
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<ResetForm>({ resolver: zodResolver(resetFormSchema) });

  const submit = handleSubmit(async ({ password }) => {
    setFormError(null);
    const request = resetPasswordRequestSchema.safeParse({ password, token });
    if (!request.success) {
      setFormError('invalidReset');
      return;
    }
    const result = await apiFetch<void>(
      '/api/v1/auth/reset-password',
      jsonRequest(request.data, { method: 'POST' }),
    );
    if (!result.ok) {
      setFormError(authErrorKey(result.status, 'reset'));
      return;
    }
    setSaved(true);
  });

  if (saved) {
    return (
      <div className="space-y-6">
        <FormAlert>{t('resetSuccess')}</FormAlert>
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
      <PasswordField
        id="reset-password"
        label={t('newPassword')}
        autoComplete="new-password"
        error={errors.password}
        errorMessage={t('validationPassword')}
        registration={register('password')}
        showLabel={t('showPassword')}
        hideLabel={t('hidePassword')}
      />
      <PasswordField
        id="reset-confirm-password"
        label={t('confirmPassword')}
        autoComplete="new-password"
        error={errors.confirmPassword}
        errorMessage={
          errors.confirmPassword?.type === 'custom'
            ? t('passwordMismatch')
            : t('validationConfirm')
        }
        registration={register('confirmPassword')}
        showLabel={t('showPassword')}
        hideLabel={t('hidePassword')}
      />
      <SubmitButton
        label={t('resetSubmit')}
        pending={isSubmitting}
        pendingLabel={t('resetPending')}
      />
    </form>
  );
}
