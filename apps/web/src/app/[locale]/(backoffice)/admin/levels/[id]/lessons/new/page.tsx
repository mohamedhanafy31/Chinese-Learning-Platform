import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { LessonForm } from '@/components/admin/lesson-form';
import { getAdminLevel } from '@/lib/admin-api';
import { pick } from '@/lib/localized';
import { requireUser } from '@/lib/protected-session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('adminLessonNew'), robots: { index: false, follow: false } };
}

export default async function NewLessonPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireUser(locale, `/${locale}/admin/levels/${id}/lessons/new`, true);
  const t = await getTranslations('Admin.lessons');
  const level = await getAdminLevel(id);

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-8 lg:py-20">
      <Link
        href={`/${locale}/admin/levels/${level.id}`}
        className="inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-4 hover:text-deep"
      >
        {t('backToLevel')}
      </Link>
      <h1 className="mt-4 font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
        {t('newTitle')}
      </h1>
      <p className="mt-3 max-w-[34rem] text-lg leading-[1.8] text-cobalt">
        {t('newIntro', { level: pick(level.title, locale) })}
      </p>
      <div className="mt-10">
        <LessonForm levelId={level.id} locale={locale} />
      </div>
    </section>
  );
}
