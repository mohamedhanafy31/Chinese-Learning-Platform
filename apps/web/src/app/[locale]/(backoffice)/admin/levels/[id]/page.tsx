import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { AuditHistory } from '@/components/admin/audit-history';
import { LessonsList } from '@/components/admin/lessons-list';
import { LevelForm } from '@/components/admin/level-form';
import { LifecycleActions } from '@/components/admin/lifecycle-actions';
import { getAdminLevel, getRecentAudit } from '@/lib/admin-api';
import { pick } from '@/lib/localized';
import { requireUser } from '@/lib/protected-session';
import { EmptyState } from '@/components/ui/empty-state';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('adminLevelEdit'),
    robots: { index: false, follow: false },
  };
}

export default async function EditLevelPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireUser(locale, `/${locale}/admin/levels/${id}`, true);
  const t = await getTranslations('Admin.levelPage');
  const tLessons = await getTranslations('Admin.lessons');
  const [level, history] = await Promise.all([
    getAdminLevel(id),
    getRecentAudit('Level', id),
  ]);
  const title = pick(level.title, locale);
  const { lessons, ...levelOnly } = level;

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-8 lg:py-20">
      <Link
        href={`/${locale}/admin/levels`}
        className="inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-4 hover:text-deep"
      >
        {t('back')}
      </Link>
      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
        <span
          lang="zh"
          aria-hidden="true"
          className="font-brush text-6xl leading-none text-cobalt"
        >
          {level.hanzi}
        </span>
        <h1 className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
          {title}
        </h1>
      </div>

      <div className="mt-10 rounded-2xl bg-glaze-shade p-6">
        <h2 className="mb-4 text-xl font-semibold text-deep">
          {t('visibilityTitle')}
        </h2>
        <LifecycleActions
          kind="level"
          id={level.id}
          title={title}
          locale={locale}
          isPublished={level.isPublished}
          archivedAt={level.archivedAt}
          firstPublishedAt={level.firstPublishedAt}
          afterDeleteHref={`/${locale}/admin/levels`}
        />
      </div>

      <div className="mt-14">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold text-deep">
            {t('lessonsTitle')}
          </h2>
          <Link
            href={`/${locale}/admin/levels/${level.id}/lessons/new`}
            className="inline-flex min-h-14 items-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt"
          >
            {tLessons('add')}
          </Link>
        </div>
        <div className="mt-6">
          {lessons.length === 0 ? (
            <EmptyState
              body={tLessons('empty')}
              action={{
                href: `/${locale}/admin/levels/${level.id}/lessons/new`,
                label: tLessons('add'),
              }}
            />
          ) : (
            <LessonsList lessons={lessons} levelId={level.id} locale={locale} />
          )}
        </div>
      </div>

      <div className="mt-16">
        <LevelForm level={levelOnly} locale={locale} />
      </div>

      <AuditHistory
        entries={history}
        entity="Level"
        entityId={level.id}
        locale={locale}
      />
    </section>
  );
}
