import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Locale } from '@app/shared';

import { LessonPath } from '@/components/learning/lesson-path';
import { Band } from '@/components/porcelain/band';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { pick, sampleLevels } from '@/content/sample-course';
import { numberFormat } from '@/lib/numbers';
import { toPathLessons } from '@/lib/path-lessons';

interface LevelPageProps {
  params: Promise<{ locale: Locale; slug: string }>;
}

export function generateStaticParams(): Array<{ locale: string; slug: string }> {
  return Object.values(Locale).flatMap((locale) =>
    sampleLevels.map((level) => ({ locale, slug: level.slug })),
  );
}

export default async function LevelPage({
  params,
}: LevelPageProps): Promise<React.JSX.Element> {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const level = sampleLevels.find((item) => item.slug === slug);
  if (!level) notFound();

  const t = await getTranslations('Level');
  const tHome = await getTranslations('Home');
  const tPath = await getTranslations('Path');
  const nf = numberFormat(locale);
  const lessons = await toPathLessons(level, locale);
  const done = level.lessons.filter((lesson) => lesson.state === 'done').length;
  const total = level.lessons.length;
  const price =
    level.priceMinor === null
      ? tHome('pricePending')
      : tHome('priceLabel', { price: nf.format(level.priceMinor / 100) });

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
            <div className="mt-6 grid items-end gap-8 md:grid-cols-[auto_minmax(0,1fr)_auto]">
              <span
                lang="zh"
                aria-hidden="true"
                className="font-brush text-[clamp(5rem,12vw,8.5rem)] leading-[0.9] text-cobalt"
              >
                {level.hanzi}
              </span>
              <div className="min-w-0">
                <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-deep">
                  {pick(level.title, locale)}
                </h1>
                <p className="mt-2 text-cobalt">
                  {tHome('levelWord')} {nf.format(level.number)} ·{' '}
                  {t('lessonsCount', { count: nf.format(total) })}
                </p>
                <p className="mt-3 max-w-[40rem] text-lg leading-[1.8] text-cobalt">
                  {pick(level.summary, locale)}
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 md:items-end">
                <button
                  type="button"
                  disabled={level.priceMinor === null}
                  className="inline-flex min-h-14 items-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt disabled:cursor-not-allowed disabled:bg-wash disabled:text-cobalt"
                >
                  {t('buy')}
                </button>
                <span className="text-sm text-cobalt">{price}</span>
              </div>
            </div>

            {total > 0 ? (
              <div className="mt-10">
                <p className="text-sm text-cobalt tabular">
                  {t('progress', { done: nf.format(done), total: nf.format(total) })}
                </p>
                <div aria-hidden="true" className="mt-3 flex gap-1.5">
                  {level.lessons.map((lesson) => (
                    <span
                      key={lesson.id}
                      className={`h-2.5 flex-1 rounded-full ${
                        lesson.state === 'done'
                          ? 'bg-deep'
                          : lesson.state === 'next'
                            ? 'bg-seal'
                            : lesson.state === 'preview'
                              ? 'bg-cobalt-mid'
                              : 'border border-dashed border-unfired'
                      }`}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <Band kind="lotus" ink="var(--color-cobalt)" />
        </section>

        <section className="bg-glaze-shade">
          <div className="mx-auto grid max-w-[1100px] gap-12 px-4 py-14 sm:px-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div>
              <h2 className="text-xl font-semibold text-deep">{t('lessons')}</h2>
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
                      start: tPath('start'),
                      sealedBy: tPath('sealedBy'),
                    }}
                  />
                ) : (
                  <p className="rounded-2xl border-2 border-dashed border-unfired px-6 py-10 text-center text-lg text-cobalt">
                    {t('empty')}
                  </p>
                )}
              </div>
            </div>
            <aside>
              <h2 className="text-xl font-semibold text-deep">{t('includes')}</h2>
              <ul className="mt-6 space-y-3 text-cobalt">
                {level.topics.map((topic) => (
                  <li key={topic.en} className="flex items-center gap-3">
                    <span aria-hidden="true" className="size-2 rotate-45 bg-cobalt" />
                    {pick(topic, locale)}
                  </li>
                ))}
              </ul>
              <p className="mt-8 inline-block rounded-full border border-dashed border-unfired px-3 py-1 text-xs text-cobalt">
                {tHome('sample')}
              </p>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
