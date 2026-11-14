import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Archive, Check } from 'lucide-react';

import {
  Locale,
  type LessonAccess,
  type MyLevelDetail,
  type PublicLevelDetail,
} from '@app/shared';

import { LessonPath } from '@/components/learning/lesson-path';
import { ProgressBar } from '@/components/learning/progress-bar';
import { WriteOn } from '@/components/motion/write-on';
import { Band } from '@/components/porcelain/band';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getPublicLevel } from '@/lib/catalog';
import { accessById, progressSegments } from '@/lib/lesson-access';
import { getLevelAccess, getMyLevel } from '@/lib/learning';
import { pick } from '@/lib/localized';
import { numberFormat } from '@/lib/numbers';
import { toCatalogPathLessons } from '@/lib/path-lessons';
import { absoluteUrl } from '@/lib/site-url';
import { EmptyState } from '@/components/ui/empty-state';

/** What the page renders: the public detail, or an owned (maybe archived) level. */
type LevelView = Pick<
  PublicLevelDetail,
  | 'hanzi'
  | 'title'
  | 'summary'
  | 'topics'
  | 'coverImage'
  | 'lessonCount'
  | 'lessons'
> &
  Pick<MyLevelDetail, 'number'>;

interface LevelPageProps {
  params: Promise<{ locale: Locale; slug: string }>;
}

function localeAlternates(slug: string): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.values(Locale).map((locale) => [
        locale,
        absoluteUrl(`/${locale}/levels/${slug}`),
      ]),
    ),
    'x-default': absoluteUrl(`/${Locale.AR}/levels/${slug}`),
  };
}

export async function generateMetadata({
  params,
}: LevelPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const result = await getPublicLevel(slug);
  if (result.status !== 'ok') return {};

  const level: PublicLevelDetail = result.data;
  const t = await getTranslations({ locale, namespace: 'Brand' });
  const title = `${pick(level.title, locale)} · ${t('name')}`;
  const description = pick(level.summary, locale);
  const url = absoluteUrl(`/${locale}/levels/${slug}`);

  return {
    title,
    description,
    alternates: { canonical: url, languages: localeAlternates(slug) },
    openGraph: {
      type: 'website',
      title,
      description,
      url,
      locale,
      images: level.coverImage
        ? [
            {
              url: absoluteUrl(level.coverImage.url),
              width: level.coverImage.width,
              height: level.coverImage.height,
            },
          ]
        : undefined,
    },
  };
}

export default async function LevelPage({
  params,
}: LevelPageProps): Promise<React.JSX.Element> {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const [result, access] = await Promise.all([
    getPublicLevel(slug),
    getLevelAccess(slug),
  ]);
  // An archived level is gone from the public catalog but stays readable for
  // the learners who own it.
  // Enrolled viewers are also read uncached, so an archive done in the last
  // minute is never hidden behind the cached public detail.
  const owned =
    result.status === 'not-found' || access?.enrolled
      ? await getMyLevel(slug)
      : null;
  if (result.status === 'not-found' && !owned) notFound();

  const t = await getTranslations('Level');

  if (result.status === 'unavailable' && !owned) {
    return (
      <>
        <SiteHeader locale={locale} tone="on-glaze" />
        <main className="mx-auto max-w-[1100px] px-4 py-20 text-center sm:px-8 lg:py-24">
          <h1 className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
            {t('unavailableTitle')}
          </h1>
          <p className="mx-auto mt-5 max-w-[34rem] text-lg leading-[1.8] text-cobalt">
            {t('unavailableBody')}
          </p>
          <Link
            href={`/${locale}#levels`}
            className="mt-8 inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-8 hover:text-deep"
          >
            {t('back')}
          </Link>
        </main>
        <SiteFooter locale={locale} />
      </>
    );
  }

  const level: LevelView | undefined =
    owned ?? (result.status === 'ok' ? result.data : undefined);
  if (!level) notFound();
  const enrolled = owned !== null || access?.enrolled === true;
  const archived = owned?.archived === true;
  // The enrolled learner's sequence: done, next, preview and locked lessons.
  const lessonAccess: Map<string, LessonAccess> = owned
    ? new Map(
        owned.progress.lessons.map((lesson) => [lesson.id, lesson.access]),
      )
    : accessById(access);
  const enrolledProgress = owned
    ? {
        completed: owned.progress.completed,
        total: owned.progress.total,
        segments: progressSegments(owned.progress.lessons),
      }
    : access?.enrolled && access.progress
      ? {
          completed: access.progress.completed,
          total: access.progress.total,
          segments: progressSegments(access.lessons),
        }
      : null;
  const tHome = await getTranslations('Home');
  const tPath = await getTranslations('Path');
  const tProgress = await getTranslations('Progress');
  const nf = numberFormat(locale);
  const lessons = await toCatalogPathLessons(
    level.lessons,
    locale,
    lessonAccess,
    (lessonId) => `/${locale}/learn/${slug}/${lessonId}`,
  );
  const cover = level.coverImage;

  return (
    <>
      <SiteHeader locale={locale} tone="on-glaze" />
      <main>
        <section className="bg-glaze">
          <div className="mx-auto max-w-[1100px] px-4 pb-12 pt-6 sm:px-8 lg:pt-10">
            <Link
              href={`/${locale}#levels`}
              className="inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-4 hover:text-deep"
            >
              {t('back')}
            </Link>
            <div
              className={`mt-6 grid items-center gap-8 ${
                cover ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''
              }`}
            >
              <div
                className={`grid items-end gap-8 md:grid-cols-[auto_minmax(0,1fr)_auto] ${
                  cover ? 'lg:grid-cols-[auto_minmax(0,1fr)]' : ''
                }`}
              >
                <span
                  lang="zh"
                  aria-hidden="true"
                  className="font-brush text-[clamp(5rem,12vw,8.5rem)] leading-[0.9] text-cobalt"
                >
                  <WriteOn text={level.hanzi} mode="char" stagger={220} />
                </span>
                <div className="min-w-0">
                  <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-deep">
                    <WriteOn text={pick(level.title, locale)} delay={350} />
                  </h1>
                  <p className="mt-2 text-cobalt">
                    {level.number === null
                      ? null
                      : `${tHome('levelWord')} ${nf.format(level.number)} · `}
                    {t('lessonsCount', {
                      count: level.lessonCount,
                    })}
                  </p>
                  <p className="mt-3 max-w-[40rem] text-lg leading-[1.8] text-cobalt">
                    {pick(level.summary, locale)}
                  </p>
                </div>
                <div
                  className={`flex flex-col items-start gap-2 md:items-end ${
                    cover ? 'lg:col-span-2 lg:items-start' : ''
                  }`}
                >
                  {enrolled ? (
                    <>
                      <p
                        data-testid="level-enrolled"
                        className="inline-flex min-h-14 items-center gap-2 text-lg font-semibold text-deep"
                      >
                        <Check
                          aria-hidden="true"
                          className="size-6 shrink-0"
                          strokeWidth={2.5}
                        />
                        {t('accountAccess')}
                      </p>
                      <span className="max-w-[16rem] text-sm text-cobalt md:text-end lg:text-start">
                        {t('enrolledNote')}
                      </span>
                      {archived ? (
                        <p className="mt-1 flex max-w-[16rem] items-start gap-2 text-sm font-semibold text-deep">
                          <Archive
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0"
                          />
                          {t('archivedNote')}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <div className="flex max-w-[24rem] flex-col items-start gap-2 md:items-end lg:items-start">
                      <Link
                        href={`/${locale}/register?${new URLSearchParams({ next: `/${locale}/levels/${slug}` })}`}
                        className="inline-flex min-h-14 items-center justify-center rounded-full bg-deep px-8 text-center text-lg font-semibold text-glaze transition-colors hover:bg-cobalt"
                      >
                        {t('createAccount')}
                      </Link>
                      <Link
                        href={`/${locale}/login?${new URLSearchParams({ next: `/${locale}/levels/${slug}` })}`}
                        className="inline-flex min-h-11 items-center text-sm text-cobalt underline decoration-wash-strong underline-offset-8 hover:text-deep"
                      >
                        {t('signIn')}
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {cover ? (
                <div
                  data-testid="level-cover"
                  className="relative aspect-video w-full overflow-hidden rounded-2xl bg-cobalt"
                >
                  <Image
                    src={cover.url}
                    alt=""
                    width={cover.width}
                    height={cover.height}
                    unoptimized
                    className="size-full object-cover"
                  />
                </div>
              ) : null}
            </div>
          </div>
          <div data-reveal="band" suppressHydrationWarning>
            <Band kind="lotus" ink="var(--color-cobalt)" />
          </div>
        </section>

        <section className="bg-glaze-shade">
          <div className="mx-auto grid max-w-[1100px] gap-12 px-4 py-14 sm:px-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div>
              <h2 className="text-xl font-semibold text-deep">
                {t('lessons')}
              </h2>
              {enrolledProgress && lessons.length > 0 ? (
                <div
                  data-testid="level-progress"
                  className="mt-5 max-w-[34rem]"
                >
                  <p className="mb-3 font-semibold text-deep tabular">
                    {tProgress('count', {
                      completed: nf.format(enrolledProgress.completed),
                      total: nf.format(enrolledProgress.total),
                    })}
                  </p>
                  <ProgressBar
                    segments={enrolledProgress.segments}
                    labels={{
                      bar: tProgress('bar'),
                      done: tPath('done'),
                      next: tPath('next'),
                      locked: tPath('locked'),
                      preview: tPath('preview'),
                      open: tPath('open'),
                    }}
                  />
                </div>
              ) : null}
              <div className="mt-6">
                {lessons.length > 0 ? (
                  <LessonPath
                    title={t('lessons')}
                    lessons={lessons}
                    labels={{
                      done: tPath('done'),
                      next: tPath('next'),
                      locked: tPath('locked'),
                      preview: tPath('preview'),
                      open: tPath('open'),
                      start: tPath('start'),
                      sealedBy: tPath('sealedBy'),
                    }}
                  />
                ) : (
                  <EmptyState body={t('empty')} />
                )}
              </div>
            </div>
            <aside>
              <h2 className="text-xl font-semibold text-deep">
                {t('includes')}
              </h2>
              {level.topics.length > 0 ? (
                <ul className="mt-6 space-y-3 text-cobalt">
                  {level.topics.map((topic, index) => (
                    <li
                      key={`${index}-${topic.en}`}
                      className="flex items-center gap-3"
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rotate-45 bg-cobalt"
                      />
                      {pick(topic, locale)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-6 text-cobalt">{t('includesEmpty')}</p>
              )}
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
