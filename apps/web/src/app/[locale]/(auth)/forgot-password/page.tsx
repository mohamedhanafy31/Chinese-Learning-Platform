import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { AuthShell } from '@/components/auth/auth-shell';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('forgot'), robots: { index: false, follow: false } };
}

export default async function ForgotPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ portal?: string | string[] }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const portal = query.portal === 'admin' ? 'admin' : 'student';
  const t = await getTranslations('Auth');
  return (
    <AuthShell
      title={t('forgotTitle')}
      hanzi={t('forgotHanzi')}
      description={t('forgotDescription')}
    >
      <ForgotPasswordForm locale={locale} portal={portal} />
    </AuthShell>
  );
}
