import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { LevelsList } from '@/components/admin/levels-list';
import { getAdminLevels } from '@/lib/admin-api';
import { requireUser } from '@/lib/protected-session';
import { EmptyState } from '@/components/ui/empty-state';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('adminLevels'), robots: { index: false, follow: false } };
}

export default async function AdminLevelsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale, `/${locale}/admin/levels`, true);
  const t = await getTranslations('Admin.levels');
  const levels = await getAdminLevels();

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-8 lg:py-20">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
            {t('title')}
          </h1>
          <p className="mt-3 max-w-[34rem] text-lg leading-[1.8] text-cobalt">
            {t('intro')}
          </p>
        </div>
        <Link
          href={`/${locale}/admin/levels/new`}
          className="inline-flex min-h-14 items-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt"
        >
          {t('new')}
        </Link>
      </div>
      <div className="mt-10">
        {levels.length === 0 ? (
          <EmptyState
            body={t('empty')}
            action={{
              href: `/${locale}/admin/levels/new`,
              label: t('new'),
            }}
          />
        ) : (
          <LevelsList levels={levels} locale={locale} />
        )}
      </div>
    </section>
  );
}
