'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  registerRequestSchema,
  userResponseSchema,
  type Locale,
  type RegisterRequest,
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

type RegisterInput = z.input<typeof registerRequestSchema>;

export function RegisterForm({
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
  } = useForm<RegisterInput, unknown, RegisterRequest>({
    resolver: zodResolver(registerRequestSchema),
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await apiFetch<unknown>(
      '/api/v1/auth/register',
      jsonRequest(values, { method: 'POST' }),
    );
    if (!result.ok) {
      setFormError(authErrorKey(result.status, 'register'));
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
      {formError ? (
        <FormAlert>
          {t(formError)}{' '}
          {formError === 'duplicateEmail' ? (
            <Link
              href={`/${locale}/login`}
              className="underline decoration-wash-strong underline-offset-4"
            >
              {t('duplicateLogin')}
            </Link>
          ) : null}
        </FormAlert>
      ) : null}
      <FormField
        id="register-name"
        label={t('name')}
        autoComplete="name"
        error={errors.name}
        errorMessage={t('validationName')}
        registration={register('name')}
      />
      <FormField
        id="register-email"
        type="email"
        label={t('email')}
        autoComplete="email"
        error={errors.email}
        errorMessage={t('validationEmail')}
        registration={register('email')}
      />
      <FormField
        id="register-phone"
        type="tel"
        inputMode="tel"
        dir="ltr"
        label={t('phone')}
        autoComplete="tel"
        placeholder={t('phonePlaceholder')}
        helper={t('phoneHelper')}
        error={errors.phone}
        errorMessage={t('validationPhone')}
        registration={register('phone')}
      />
      <PasswordField
        id="register-password"
        label={t('password')}
        autoComplete="new-password"
        error={errors.password}
        errorMessage={t('validationPassword')}
        registration={register('password')}
        showLabel={t('showPassword')}
        hideLabel={t('hidePassword')}
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <SubmitButton
          label={t('registerSubmit')}
          pending={isSubmitting}
          pendingLabel={t('registerPending')}
        />
        <Link href={`/${locale}/login`} className={secondaryLink}>
          {t('loginLink')}
        </Link>
      </div>
    </form>
  );
}
