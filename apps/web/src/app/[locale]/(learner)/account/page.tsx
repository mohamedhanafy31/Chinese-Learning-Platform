import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Role, type Locale } from '@app/shared';

import { LogoutButton } from '@/components/auth/logout-button';
import { requireUser } from '@/lib/protected-session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('account'), robots: { index: false, follow: false } };
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, `/${locale}/account`, Role.STUDENT);
  const t = await getTranslations('Account');

  const details = [
    { label: t('name'), value: user.name, direction: undefined },
    { label: t('email'), value: user.email, direction: 'ltr' as const },
    { label: t('phone'), value: user.phone, direction: 'ltr' as const },
  ];

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-20 sm:px-8 lg:py-24">
      <div className="max-w-[46rem]">
        <p lang="zh" className="font-brush text-3xl text-cobalt">
          我的账户
        </p>
        <h1 className="mt-3 font-display text-balance text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-deep">
          {t('title')}
        </h1>
        <p className="mt-5 max-w-[38rem] text-lg leading-[1.8] text-cobalt">
          {t('intro')}
        </p>

        <dl className="mt-12 border-y-2 border-cobalt">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="grid gap-1 border-b border-wash py-5 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6"
            >
              <dt className="text-sm font-semibold text-cobalt">
                {detail.label}
              </dt>
              <dd
                dir={detail.direction}
                className="min-w-0 break-words text-lg tabular text-deep"
              >
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3">
          <Link
            href={`/${locale}/dashboard`}
            className="inline-flex min-h-14 items-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt"
          >
            {t('learning')}
          </Link>
          <Link
            href={`/${locale}/forgot-password`}
            className="inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-8 transition-colors hover:text-deep"
          >
            {t('password')}
          </Link>
        </div>

        <div className="mt-14 border-t border-wash pt-8">
          <h2 className="text-xl font-semibold text-deep">{t('session')}</h2>
          <p className="mt-2 max-w-[34rem] leading-7 text-cobalt">
            {t('sessionDescription')}
          </p>
          <div className="mt-5">
            <LogoutButton
              locale={locale}
              label={t('logout')}
              pendingLabel={t('loggingOut')}
              errorLabel={t('logoutError')}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
