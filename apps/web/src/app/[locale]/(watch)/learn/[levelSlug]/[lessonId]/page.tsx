import { ArrowLeft, ArrowRight, Lock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale, PlaybackNoVideo, PlaybackResponse } from '@app/shared';

import { LessonPath } from '@/components/learning/lesson-path';
import { WriteOn } from '@/components/motion/write-on';
import {
  primaryButtonClass,
  secondaryLinkClass,
} from '@/components/admin/classes';
import {
  LessonPlayer,
  VideoPlaceholder,
} from '@/components/video/lesson-player';
import { SessionRecovery } from '@/components/video/session-recovery';
import { getPublicLevel } from '@/lib/catalog';
import { getPlayback } from '@/lib/learning';
import { pick } from '@/lib/localized';
import { numberFormat } from '@/lib/numbers';
import type { PathLesson, PathState } from '@/components/learning/lesson-path';

interface LessonPageProps {
  params: Promise<{ locale: Locale; levelSlug: string; lessonId: string }>;
}

export async function generateMetadata({
  params,
}: LessonPageProps): Promise<Metadata> {
  const { locale, lessonId } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const result = await getPlayback(lessonId);
  const robots = { index: false, follow: false };

  if (result.status === 'ok' || result.status === 'no-video') {
    const { lesson, level } = result.data;
    return {
      title: t('lessonNamed', {
        lesson: pick(lesson.title, locale),
        level: pick(level.title, locale),
      }),
      robots,
    };
  }
  return { title: t('lesson'), robots };
}

type Context = PlaybackResponse | PlaybackNoVideo;

const siblingState: Record<'open' | 'preview' | 'locked', PathState> = {
  open: 'open',
  preview: 'preview',
  locked: 'locked',
};

/** A centred card for the viewers who cannot watch (signed out, not enrolled, error). */
function MessageCard({
  actions,
  body,
  title,
}: {
  title: string;
  body: string;
  actions?: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="mx-auto max-w-[1100px] px-4 py-16 sm:px-8 lg:py-24">
      <div
        data-testid="lesson-gate"
        className="mx-auto max-w-[40rem] rounded-2xl bg-glaze-shade p-8 text-center sm:p-12"
      >
        <span
          aria-hidden="true"
          className="mx-auto grid size-14 place-items-center rounded-full border-2 border-dashed border-unfired bg-glaze text-unfired-ink"
        >
          <Lock className="size-6" strokeWidth={2} />
        </span>
        <h1 className="mt-6 font-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.1] text-deep">
          {title}
        </h1>
        <p className="mt-4 text-lg leading-[1.8] text-cobalt">{body}</p>
        {actions ? (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default async function LessonPage({
  params,
}: LessonPageProps): Promise<React.JSX.Element> {
  const { locale, levelSlug, lessonId } = await params;
  setRequestLocale(locale);
  const result = await getPlayback(lessonId);
  const t = await getTranslations('Watch');

  if (result.status === 'not-found') notFound();

  if (result.status === 'error') {
    return <MessageCard title={t('errorTitle')} body={t('errorBody')} />;
  }

  const here = `/${locale}/learn/${levelSlug}/${lessonId}`;

  if (result.status === 'login-required') {
    const next = new URLSearchParams({ next: here });
    return (
      <>
        <SessionRecovery />
        <MessageCard
          title={t('signInTitle')}
          body={t('signInBody')}
          actions={
            <>
              <Link
                href={`/${locale}/login?${next}`}
                className={primaryButtonClass}
              >
                {t('signIn')}
              </Link>
              <Link
                href={`/${locale}/register?${next}`}
                className={secondaryLinkClass}
              >
                {t('register')}
              </Link>
            </>
          }
        />
      </>
    );
  }

  if (result.status === 'not-enrolled') {
    const slug = result.levelSlug ?? levelSlug;
    const level = await getPublicLevel(slug);
    const title =
      level.status === 'ok'
        ? t('levelTitle', { level: pick(level.data.title, locale) })
        : t('levelTitleGeneric');
    return (
      <MessageCard
        title={title}
        body={t('levelBody')}
        actions={
          <Link
            href={`/${locale}/levels/${slug}`}
            className={primaryButtonClass}
          >
            {t('viewLevel')}
          </Link>
        }
      />
    );
  }

  const data: Context = result.data;
  if (data.level.slug !== levelSlug) notFound();

  const tPath = await getTranslations('Path');
  const tLevel = await getTranslations('Level');
  const nf = numberFormat(locale);
  const title = pick(data.lesson.title, locale);
  const description = data.lesson.description
    ? pick(data.lesson.description, locale)
    : null;
  const levelTitle = pick(data.level.title, locale);

  const siblings = data.siblings;
  const index = siblings.findIndex((sibling) => sibling.id === data.lesson.id);
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 ? siblings[index + 1] : undefined;
  const hrefFor = (id: string): string =>
    `/${locale}/learn/${data.level.slug}/${id}`;

  const pathLessons: PathLesson[] = siblings.map((sibling) => ({
    id: sibling.id,
    number: tPath('lessonNumber', { n: nf.format(sibling.number) }),
    title: pick(sibling.title, locale),
    hanzi: sibling.hanzi ?? '',
    state: siblingState[sibling.access],
    href: hrefFor(sibling.id),
    current: sibling.id === data.lesson.id,
  }));

  const neighbour = (
    sibling: (typeof siblings)[number] | undefined,
    direction: 'previous' | 'next',
  ): React.JSX.Element | null => {
    if (!sibling) return null;
    const Arrow = direction === 'previous' ? ArrowLeft : ArrowRight;
    const label = direction === 'previous' ? t('previous') : t('next');
    const text = pick(sibling.title, locale);
    const content = (
      <>
        {direction === 'previous' ? (
          <Arrow
            aria-hidden="true"
            className="size-5 shrink-0 rtl:-scale-x-100"
          />
        ) : null}
        <span className="min-w-0">
          <span className="block text-sm">{label}</span>
          <span className="block truncate font-semibold">{text}</span>
        </span>
        {direction === 'next' ? (
          <Arrow
            aria-hidden="true"
            className="size-5 shrink-0 rtl:-scale-x-100"
          />
        ) : null}
      </>
    );
    const shared = `flex min-h-14 min-w-0 items-center gap-3 rounded-2xl px-4 ${
      direction === 'next' ? 'justify-end text-end' : ''
    }`;
    if (sibling.access === 'locked') {
      return (
        <p
          className={`${shared} border-2 border-dashed border-unfired text-unfired-ink`}
        >
          <Lock aria-hidden="true" className="size-5 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm">{label}</span>
            <span className="block truncate font-semibold">
              {text} · {tPath('locked')}
            </span>
          </span>
        </p>
      );
    }
    return (
      <Link
        href={hrefFor(sibling.id)}
        rel={direction}
        className={`${shared} border-[1.5px] border-wash-strong text-cobalt transition-colors hover:border-cobalt hover:bg-white hover:text-deep`}
      >
        {content}
      </Link>
    );
  };

  const previousLink = neighbour(previous, 'previous');
  const nextLink = neighbour(next, 'next');

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-6 sm:px-8 lg:px-[72px] lg:pb-24 lg:pt-10">
      <Link
        href={`/${locale}/levels/${data.level.slug}`}
        className="inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-4 hover:text-deep"
      >
        {t('backToLevel')}
      </Link>

      <div className="mt-4 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
        <article className="min-w-0">
          {result.status === 'ok' ? (
            <LessonPlayer
              label={t('playerLabel')}
              src={result.data.video.src}
              poster={result.data.poster}
              unsupported={t('unsupported')}
            />
          ) : (
            <VideoPlaceholder
              title={t('comingSoonTitle')}
              body={t('comingSoonBody')}
            />
          )}

          {previousLink || nextLink ? (
            <nav
              aria-label={t('navLabel')}
              className="mt-6 grid gap-3 sm:grid-cols-2"
            >
              <div>{previousLink}</div>
              <div>{nextLink}</div>
            </nav>
          ) : null}

          <h1 className="mt-10 font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
            <WriteOn text={title} />
          </h1>
          <p className="mt-2 text-cobalt tabular">
            {levelTitle} ·{' '}
            {tPath('lessonNumber', { n: nf.format(data.lesson.number) })}
          </p>
          {data.lesson.hanzi ? (
            <p
              lang="zh"
              className="mt-4 font-brush text-[clamp(1.4rem,3.2vw,2.75rem)] leading-[1.25] tracking-[0.06em] text-cobalt"
            >
              <WriteOn text={data.lesson.hanzi} mode="char" />
            </p>
          ) : null}
          {description ? (
            <p
              data-reveal=""
              className="mt-5 max-w-[40rem] text-lg leading-[1.85] text-cobalt"
            >
              {description}
            </p>
          ) : null}
        </article>

        <aside aria-labelledby="lesson-path-title" className="min-w-0">
          <h2
            id="lesson-path-title"
            className="text-xl font-semibold text-deep"
          >
            {tLevel('lessons')}
          </h2>
          <div className="mt-6 rounded-2xl bg-glaze-shade p-3 sm:p-4">
            <LessonPath
              title={tLevel('lessons')}
              lessons={pathLessons}
              labels={{
                done: tPath('done'),
                next: tPath('next'),
                locked: tPath('locked'),
                preview: tPath('preview'),
                open: tPath('open'),
                start: tPath('start'),
                sealedBy: tPath('sealedBy'),
                current: tPath('current'),
              }}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
