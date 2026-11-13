import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import type { Locale } from '@app/shared';

import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/login-form';
import { roleHome } from '@/lib/role-home';
import { getCurrentUserIfAvailable } from '@/lib/session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('login'), robots: { index: false, follow: false } };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ next?: string | string[] }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUserIfAvailable();
  if (user) redirect(roleHome(locale, user.role));
  const query = await searchParams;
  const next = typeof query.next === 'string' ? query.next : undefined;
  const t = await getTranslations('Auth');

  return (
    <AuthShell
      title={t('loginTitle')}
      hanzi={t('studentLoginHanzi')}
      description={t('loginDescription')}
    >
      <LoginForm locale={locale} next={next} />
    </AuthShell>
  );
}
