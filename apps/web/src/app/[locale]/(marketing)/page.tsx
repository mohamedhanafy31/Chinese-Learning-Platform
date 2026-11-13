import Link from 'next/link';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { RTL_LOCALES, type Locale } from '@app/shared';

import { PlateHero, type PlateLevel } from '@/components/landing/plate-hero';
import { LessonPath } from '@/components/learning/lesson-path';
import { Band } from '@/components/porcelain/band';
import { WriteOn } from '@/components/motion/write-on';
import { Seal } from '@/components/porcelain/seal';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getPublicLevels } from '@/lib/catalog';
import { pick } from '@/lib/localized';
import { numberFormat } from '@/lib/numbers';
import { toSamplePathLessons } from '@/lib/path-lessons';
import { EmptyState } from '@/components/ui/empty-state';

interface HomePageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function HomePage({
  params,
}: HomePageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Home');
  const tPath = await getTranslations('Path');
  const nf = numberFormat(locale);
  const direction = (RTL_LOCALES as readonly Locale[]).includes(locale)
    ? 'rtl'
    : 'ltr';

  // A failing API degrades to an honest message; it never breaks the page.
  const catalog = await getPublicLevels();
  const levels = catalog.status === 'ok' ? catalog.data : [];

  const plateLevels: PlateLevel[] = levels.map((level) => ({
    slug: level.slug,
    number: nf.format(level.number),
    hanzi: level.hanzi,
    title: pick(level.title, locale),
    summary: pick(level.summary, locale),
    topics: level.topics.map((topic) => pick(topic, locale)),
    href: `/${locale}/levels/${level.slug}`,
    coverImage: level.coverImage,
  }));

  const firstLevel = levels[0];
  const startHref = firstLevel
    ? `/${locale}/levels/${firstLevel.slug}`
    : `/${locale}#levels`;
  const exampleLessons = await toSamplePathLessons(locale);

  const steps = [
    { glyph: '一', title: t('step1Title'), body: t('step1Body') },
    { glyph: '二', title: t('step2Title'), body: t('step2Body') },
    { glyph: '三', title: t('step3Title'), body: t('step3Body') },
  ];

  return (
    <>
      <SiteHeader locale={locale} tone="on-cobalt" />
      <main>
        <PlateHero
          direction={direction}
          levels={plateLevels}
          copy={{
            headlineSecond: t('headlineSecond'),
            headlineSecondLang: t('headlineSecondLang'),
            headline: t('headline'),
            lede: t('lede'),
            primary: t('primary'),
            primaryHref: startHref,
            secondary: t('secondary'),
            secondaryHref: '#levels',
            levelsLabel: t('levelsLabel'),
            levelWord: t('levelWord'),
            viewLevel: t('viewLevel'),
            emptyReadout:
              catalog.status === 'unavailable'
                ? t('levelsUnavailable')
                : t('emptyReadout'),
            portraitAlt: t('portraitAlt'),
          }}
        />
        <div data-reveal="band" suppressHydrationWarning className="bg-deep">
          <Band
            kind="wave"
            ink="var(--color-wash-strong)"
            ground="var(--color-deep)"
          />
        </div>

        {/* the path */}
        <section className="mx-auto grid max-w-[1440px] gap-12 px-4 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20 lg:px-[72px] lg:py-28">
          <div className="lg:pt-6">
            <h2 className="font-display text-balance text-[clamp(2.25rem,4.5vw,3.75rem)] leading-[1.1] text-deep">
              <WriteOn text={t('pathTitle')} />
            </h2>
            <p
              data-reveal=""
              suppressHydrationWarning
              style={{ '--reveal-delay': '300ms' } as React.CSSProperties}
              className="mt-6 max-w-[34rem] text-pretty text-lg leading-[1.85] text-cobalt"
            >
              {t('pathBody')}
            </p>
            <div className="mt-8 flex items-center gap-3 text-cobalt">
              <span
                data-reveal="seal"
                suppressHydrationWarning
                style={{ '--reveal-delay': '700ms' } as React.CSSProperties}
              >
                <Seal size={34} />
              </span>
              <span>{tPath('sealedBy')}</span>
            </div>
          </div>
          <div>
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="text-sm text-cobalt">{t('pathExample')}</p>
              <SampleTag label={t('sample')} />
            </div>
            <LessonPath
              title={t('pathExample')}
              lessons={exampleLessons}
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
          </div>
        </section>

        {/* how it works */}
        <section className="bg-glaze-shade">
          <div data-reveal="band" suppressHydrationWarning>
            <Band kind="lotus" ink="var(--color-cobalt)" />
          </div>
          <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-8 lg:px-[72px] lg:py-24">
            <h2 className="font-display text-[clamp(2rem,4vw,3.25rem)] leading-tight text-deep">
              <WriteOn text={t('stepsTitle')} />
            </h2>
            <ol
              data-reveal="stagger"
              suppressHydrationWarning
              className="mt-12 grid gap-12 md:grid-cols-3 md:gap-0"
            >
              {steps.map((step, index) => (
                <li
                  key={step.glyph}
                  data-reveal-item=""
                  style={{ '--reveal-i': index } as React.CSSProperties}
                  className={`md:px-10 ${index > 0 ? 'md:border-s md:border-wash' : 'md:ps-0'}`}
                >
                  <span
                    lang="zh"
                    aria-hidden="true"
                    className="font-brush block text-6xl leading-none text-cobalt"
                  >
                    <WriteOn
                      text={step.glyph}
                      mode="char"
                      delay={200 + index * 180}
                    />
                  </span>
                  <h3 className="mt-5 text-2xl font-semibold text-deep">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-[22rem] leading-[1.8] text-cobalt">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* levels ledger */}
        <section
          id="levels"
          className="mx-auto max-w-[1440px] scroll-mt-6 px-4 py-20 sm:px-8 lg:px-[72px] lg:py-28"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-[clamp(2rem,4vw,3.25rem)] leading-tight text-deep">
              <WriteOn text={t('levelsLabel')} />
            </h2>
          </div>
          {plateLevels.length === 0 ? (
            <EmptyState
              className="mt-10"
              body={
                catalog.status === 'unavailable'
                  ? t('levelsUnavailable')
                  : t('levelsEmpty')
              }
            />
          ) : (
            <ul
              data-reveal="stagger"
              suppressHydrationWarning
              className="mt-10 border-t-2 border-cobalt"
            >
              {plateLevels.map((level, index) => (
                <li
                  key={level.slug}
                  data-reveal-item=""
                  style={{ '--reveal-i': index } as React.CSSProperties}
                  className="border-b border-wash"
                >
                  <Link
                    href={level.href}
                    className="group grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-6 gap-y-2 py-8 transition-colors hover:bg-white sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:px-4"
                  >
                    <span className="relative row-span-2 aspect-[4/3] overflow-hidden rounded-2xl bg-glaze-shade sm:row-span-1">
                      {level.coverImage ? (
                        <Image
                          src={level.coverImage.url}
                          alt=""
                          width={level.coverImage.width}
                          height={level.coverImage.height}
                          unoptimized
                          className="size-full object-cover opacity-75"
                        />
                      ) : null}
                      <span
                        lang="zh"
                        aria-hidden="true"
                        className="font-brush absolute inset-0 grid place-items-center whitespace-nowrap text-4xl leading-none text-deep sm:text-5xl"
                      >
                        <span className="rounded-xl bg-glaze/85 px-2 py-1">
                          {level.hanzi}
                        </span>
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-2xl font-semibold text-deep">
                        {level.title}
                      </span>
                      <span className="mt-1 block text-sm text-cobalt">
                        {t('levelWord')} {level.number}
                      </span>
                      <span className="mt-2 block max-w-[40rem] leading-relaxed text-cobalt">
                        {level.summary}
                      </span>
                    </span>
                    <span className="font-semibold text-deep underline decoration-wash-strong underline-offset-4 group-hover:decoration-deep sm:text-end">
                        {t('viewLevel')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* close */}
        <section className="bg-deep text-glaze">
          <div data-reveal="band" suppressHydrationWarning>
            <Band kind="wave" ink="var(--color-cobalt-mid)" />
          </div>
          <div className="mx-auto flex max-w-[1440px] flex-col items-start gap-8 px-4 py-20 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-[72px] lg:py-24">
            <div>
              <h2 className="font-display text-[clamp(2.5rem,5vw,4.25rem)] leading-[1.05]">
                <WriteOn text={t('closeTitle')} />
              </h2>
              <p className="mt-4 max-w-[32rem] text-lg leading-[1.8] text-wash">
                {t('closeBody')}
              </p>
            </div>
            <Link
              href={startHref}
              className="inline-flex min-h-14 items-center rounded-full bg-glaze px-8 text-lg font-semibold text-deep transition-[transform,background-color] duration-300 ease-glaze hover:-translate-y-0.5 hover:bg-white"
            >
              {t('primary')}
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

function SampleTag({ label }: { label: string }): React.JSX.Element {
  return (
    <span className="rounded-full border border-dashed border-unfired px-3 py-1 text-xs text-cobalt">
      {label}
    </span>
  );
}
