import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { LevelForm } from '@/components/admin/level-form';
import { requireUser } from '@/lib/protected-session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('adminLevelNew'), robots: { index: false, follow: false } };
}

export default async function NewLevelPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale, `/${locale}/admin/levels/new`, true);
  const t = await getTranslations('Admin.levelPage');

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-8 lg:py-20">
      <Link
        href={`/${locale}/admin/levels`}
        className="inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-4 hover:text-deep"
      >
        {t('back')}
      </Link>
      <h1 className="mt-4 font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
        {t('newTitle')}
      </h1>
      <p className="mt-3 max-w-[34rem] text-lg leading-[1.8] text-cobalt">
        {t('newIntro')}
      </p>
      <div className="mt-10">
        <LevelForm locale={locale} />
      </div>
    </section>
  );
}
