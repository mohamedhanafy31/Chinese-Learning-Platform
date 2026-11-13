'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  loginRequestSchema,
  userResponseSchema,
  type Locale,
  type LoginRequest,
  type z,
} from '@app/shared';

import {
  FormAlert,
  FormField,
  PasswordField,
  SubmitButton,
  secondaryLink,
} from '@/components/auth/form-controls';
import { apiFetch, jsonRequest } from '@/lib/api-client';
import { authErrorKey, type AuthErrorKey } from '@/lib/auth-errors';
import { safePortalNext } from '@/lib/safe-next';

type LoginInput = z.input<typeof loginRequestSchema>;

export function LoginForm({
  locale,
  next,
  portal = 'student',
}: {
  locale: Locale;
  next?: string;
  portal?: 'admin' | 'student';
}): React.JSX.Element {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<LoginInput, unknown, LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await apiFetch<unknown>(
      portal === 'admin' ? '/api/v1/auth/admin/login' : '/api/v1/auth/login',
      jsonRequest(values, { method: 'POST' }),
    );
    if (!result.ok) {
      setFormError(authErrorKey(result.status, 'login'));
      return;
    }
    const parsed = userResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      setFormError('retry');
      return;
    }
    router.replace(safePortalNext(next, locale, portal));
    router.refresh();
  });

  return (
    <form noValidate onSubmit={submit} className="space-y-6">
      {formError ? <FormAlert>{t(formError)}</FormAlert> : null}
      <FormField
        id="login-email"
        type="email"
        label={t('email')}
        autoComplete="email"
        error={errors.email}
        errorMessage={t('validationEmail')}
        registration={register('email')}
      />
      <PasswordField
        id="login-password"
        label={t('password')}
        autoComplete="current-password"
        error={errors.password}
        errorMessage={t('validationPassword')}
        registration={register('password')}
        showLabel={t('showPassword')}
        hideLabel={t('hidePassword')}
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <SubmitButton
          label={t(
            portal === 'admin' ? 'adminLoginSubmit' : 'studentLoginSubmit',
          )}
          pending={isSubmitting}
          pendingLabel={t('loginPending')}
        />
        <Link
          href={`/${locale}/forgot-password${portal === 'admin' ? '?portal=admin' : ''}`}
          className={secondaryLink}
        >
          {t('forgotLink')}
        </Link>
      </div>
      {portal === 'student' ? (
        <div>
          <Link href={`/${locale}/register`} className={secondaryLink}>
            {t('registerLink')}
          </Link>
        </div>
      ) : null}
    </form>
  );
}
