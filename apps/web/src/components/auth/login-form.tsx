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
import { roleHome } from '@/lib/role-home';
import { safeNext } from '@/lib/safe-next';

type LoginInput = z.input<typeof loginRequestSchema>;

export function LoginForm({
  locale,
  next,
}: {
  locale: Locale;
  next?: string;
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
      '/api/v1/auth/login',
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
    router.replace(safeNext(next, roleHome(locale, parsed.data.user.role)));
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
          label={t('loginSubmit')}
          pending={isSubmitting}
          pendingLabel={t('loginPending')}
        />
        <Link href={`/${locale}/forgot-password`} className={secondaryLink}>
          {t('forgotLink')}
        </Link>
      </div>
      <Link href={`/${locale}/register`} className={secondaryLink}>
        {t('registerLink')}
      </Link>
    </form>
  );
}
