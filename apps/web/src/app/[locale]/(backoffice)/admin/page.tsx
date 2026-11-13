import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { LogoutButton } from '@/components/auth/logout-button';
import { Notice } from '@/components/ui/notice';
import { getAdminOverview } from '@/lib/admin-api';
import { overviewStats } from '@/lib/overview-format';
import { requireUser } from '@/lib/protected-session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('admin'), robots: { index: false, follow: false } };
}

const quickLinks = [
  { key: 'levels', path: 'levels' },
  { key: 'students', path: 'students' },
  { key: 'audit', path: 'audit' },
] as const;

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, `/${locale}/admin`, true);
  const t = await getTranslations('Admin');
  const tOverview = await getTranslations('Admin.overview');
  const tNav = await getTranslations('Admin.nav');
  const overview = await getAdminOverview();
  const stats = overview ? overviewStats(overview, locale) : [];

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-20 sm:px-8 lg:py-24">
      <h1 className="font-display text-balance text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-deep">
        {t('greeting', { name: user.name })}
      </h1>
      <p className="mt-5 max-w-[34rem] text-lg leading-[1.8] text-cobalt">
        {t('intro')}
      </p>

      <h2 className="mt-14 text-xl font-semibold text-deep">
        {tOverview('title')}
      </h2>
      {overview === null ? (
        <div className="mt-4 max-w-[44rem]">
          <Notice role="alert">{tOverview('unavailable')}</Notice>
        </div>
      ) : (
        <dl
          data-testid="overview-stats"
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {stats.map((stat) => (
            <div
              key={stat.id}
              data-stat={stat.id}
              className="rounded-2xl border-[1.5px] border-wash-strong bg-glaze-bright p-5"
            >
              <dt className="text-sm font-semibold text-cobalt">
                {tOverview(`stats.${stat.id}`)}
              </dt>
              <dd className="mt-2 text-3xl font-semibold tabular text-deep">
                {stat.value}
              </dd>
              <p className="mt-1 text-sm text-cobalt">
                {tOverview(`hints.${stat.id}`)}
              </p>
            </div>
          ))}
        </dl>
      )}

      <h2 className="mt-14 text-xl font-semibold text-deep">
        {tOverview('quickLinks')}
      </h2>
      <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
        {quickLinks.map((link) => (
          <li key={link.key}>
            <Link
              href={`/${locale}/admin/${link.path}`}
              className="inline-flex min-h-11 items-center text-lg text-cobalt underline decoration-wash-strong underline-offset-8 transition-colors hover:text-deep"
            >
              {tNav(link.key)}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-12">
        <LogoutButton
          locale={locale}
          portal="admin"
          label={t('logout')}
          pendingLabel={t('loggingOut')}
          errorLabel={t('logoutError')}
        />
      </div>
    </section>
  );
}
