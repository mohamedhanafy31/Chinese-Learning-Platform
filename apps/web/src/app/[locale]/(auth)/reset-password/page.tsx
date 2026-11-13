import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { AuthShell } from '@/components/auth/auth-shell';
import { secondaryLink } from '@/components/auth/form-controls';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('reset'), robots: { index: false, follow: false } };
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{
    portal?: string | string[];
    token?: string | string[];
  }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const token = typeof query.token === 'string' ? query.token : undefined;
  const portal = query.portal === 'admin' ? 'admin' : 'student';
  const t = await getTranslations('Auth');

  if (!token) {
    return (
      <AuthShell
        title={t('missingTokenTitle')}
        hanzi={t('resetHanzi')}
        description={t('missingTokenBody')}
      >
        <Link
          href={`/${locale}/forgot-password${portal === 'admin' ? '?portal=admin' : ''}`}
          className={secondaryLink}
        >
          {t('requestNewLink')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t('resetTitle')}
      hanzi={t('resetHanzi')}
      description={t('resetDescription')}
    >
      <ResetPasswordForm locale={locale} portal={portal} token={token} />
    </AuthShell>
  );
}
