import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { LessonForm } from '@/components/admin/lesson-form';
import { LifecycleActions } from '@/components/admin/lifecycle-actions';
import { getAdminLesson, getAdminLevel } from '@/lib/admin-api';
import { pick } from '@/lib/localized';
import { requireUser } from '@/lib/protected-session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('adminLessonEdit'),
    robots: { index: false, follow: false },
  };
}

export default async function EditLessonPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireUser(locale, `/${locale}/admin/lessons/${id}`, true);
  const t = await getTranslations('Admin.lessons');
  const lesson = await getAdminLesson(id);
  const level = await getAdminLevel(lesson.levelId);
  const title = pick(lesson.title, locale);

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-8 lg:py-20">
      <Link
        href={`/${locale}/admin/levels/${level.id}`}
        className="inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-4 hover:text-deep"
      >
        {t('backToLevel')}
      </Link>
      <h1 className="mt-4 font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
        {title}
      </h1>
      <p className="mt-3 max-w-[34rem] text-lg leading-[1.8] text-cobalt">
        {t('editIntro', { level: pick(level.title, locale) })}
      </p>

      <div className="mt-10 rounded-2xl bg-glaze-shade p-6">
        <h2 className="mb-4 text-xl font-semibold text-deep">
          {t('visibilityTitle')}
        </h2>
        <LifecycleActions
          kind="lesson"
          id={lesson.id}
          title={title}
          locale={locale}
          isPublished={lesson.isPublished}
          archivedAt={lesson.archivedAt}
          firstPublishedAt={lesson.firstPublishedAt}
          afterDeleteHref={`/${locale}/admin/levels/${level.id}`}
        />
      </div>

      <div className="mt-14">
        <LessonForm levelId={level.id} lesson={lesson} locale={locale} />
      </div>
    </section>
  );
}
