import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { LogoutButton } from '@/components/auth/logout-button';
import { requireUser } from '@/lib/protected-session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('dashboard'), robots: { index: false, follow: false } };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, `/${locale}/dashboard`);
  const t = await getTranslations('Dashboard');

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-20 sm:px-8 lg:py-24">
      <h1 className="font-display text-balance text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-deep">
        {t('greeting', { name: user.name })}
      </h1>
      <div className="mt-12 rounded-2xl border-2 border-dashed border-unfired px-6 py-14 text-center">
        <p className="text-lg leading-[1.8] text-unfired-ink">{t('empty')}</p>
        <Link
          href={`/${locale}#levels`}
          className="mt-5 inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-8 hover:text-deep"
        >
          {t('browse')}
        </Link>
      </div>
      <div className="mt-10">
        <LogoutButton
          locale={locale}
          label={t('logout')}
          pendingLabel={t('loggingOut')}
          errorLabel={t('logoutError')}
        />
      </div>
    </section>
  );
}
