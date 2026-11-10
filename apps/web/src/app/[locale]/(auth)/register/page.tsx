import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import type { Locale } from '@app/shared';

import { AuthShell } from '@/components/auth/auth-shell';
import { RegisterForm } from '@/components/auth/register-form';
import { roleHome } from '@/lib/role-home';
import { getCurrentUser } from '@/lib/session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('register'), robots: { index: false, follow: false } };
}

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ next?: string | string[] }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (user) redirect(roleHome(locale, user.role));
  const query = await searchParams;
  const next = typeof query.next === 'string' ? query.next : undefined;
  const t = await getTranslations('Auth');

  return (
    <AuthShell
      title={t('registerTitle')}
      hanzi={t('registerHanzi')}
      description={t('registerDescription')}
    >
      <RegisterForm locale={locale} next={next} />
    </AuthShell>
  );
}
