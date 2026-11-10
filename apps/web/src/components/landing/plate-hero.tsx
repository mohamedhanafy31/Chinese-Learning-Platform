'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import {
  PANEL_RADIUS,
  PlateArt,
  WELL_RADIUS,
} from '@/components/porcelain/plate-art';

export interface PlateLevel {
  slug: string;
  number: string;
  hanzi: string;
  title: string;
  summary: string;
  topics: string[];
  price: string;
  href: string;
}

export interface PlateHeroCopy {
  headlineSecond: string;
  headlineSecondLang: string;
  headline: string;
  lede: string;
  primary: string;
  primaryHref: string;
  secondary: string;
  secondaryHref: string;
  levelsLabel: string;
  levelWord: string;
  viewLevel: string;
  emptyReadout: string;
  portraitPlaceholder: string;
  portraitAlt: string;
}

interface PlateHeroProps {
  copy: PlateHeroCopy;
  levels: PlateLevel[];
  direction: 'ltr' | 'rtl';
  portraitSrc?: string;
}

const panelOffset = `${(PANEL_RADIUS / 10).toFixed(1)}cqw`;
const wellInset = `${((500 - WELL_RADIUS) / 10).toFixed(1)}%`;

export function PlateHero({
  copy,
  levels,
  direction,
  portraitSrc,
}: PlateHeroProps): React.JSX.Element {
  const [selected, setSelected] = useState(0);
  const step = 360 / Math.max(levels.length, 1);
  // Levels advance in reading direction: clockwise for LTR, counter-clockwise for RTL.
  const sign = direction === 'rtl' ? -1 : 1;
  const rotation = -selected * step * sign;
  const current = levels[selected];

  function onKey(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (levels.length === 0) return;
    const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const back = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === forward || event.key === back) {
      event.preventDefault();
      const delta = event.key === forward ? 1 : -1;
      setSelected((value) => (value + delta + levels.length) % levels.length);
    }
  }

  return (
    <section className="relative overflow-hidden bg-deep text-glaze">
      <div className="mx-auto grid max-w-[1440px] items-center gap-6 px-4 pb-14 pt-2 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6 lg:px-[72px] lg:pb-24 lg:pt-10">
        <div className="order-2 lg:order-1">
          <h1 className="text-balance">
            <span
              lang={copy.headlineSecondLang}
              className={`block text-[clamp(1.4rem,3.2vw,2.75rem)] leading-tight text-wash-strong ${
                copy.headlineSecondLang === 'zh'
                  ? 'font-brush tracking-[0.06em]'
                  : 'tracking-normal'
              }`}
            >
              {copy.headlineSecond}
            </span>
            <span className="font-display mt-1 block text-[clamp(2.6rem,7.4vw,6rem)] leading-[1.05] lg:mt-2">
              {copy.headline}
            </span>
          </h1>
          <p className="mt-4 max-w-[34rem] text-pretty text-base leading-[1.8] text-wash sm:text-xl lg:mt-6">
            {copy.lede}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 lg:mt-9">
            <Link
              href={copy.primaryHref}
              className="inline-flex min-h-14 items-center rounded-full bg-glaze px-8 text-lg font-semibold text-deep shadow-[0_10px_30px_-12px_rgb(0_0_0/0.6)] transition-[transform,background-color] duration-300 ease-glaze hover:-translate-y-0.5 hover:bg-white"
            >
              {copy.primary}
            </Link>
            <Link
              href={copy.secondaryHref}
              className="inline-flex min-h-14 items-center rounded-full px-4 text-lg text-glaze underline decoration-wash-strong underline-offset-8 transition-colors hover:text-white"
            >
              {copy.secondary}
            </Link>
          </div>

          {!current ? (
            <p
              aria-live="polite"
              className="mt-10 max-w-[34rem] border-t border-cobalt-mid pt-6 text-wash lg:mt-12"
            >
              {copy.emptyReadout}
            </p>
          ) : (
            <div
              aria-live="polite"
              className="mt-10 max-w-[34rem] border-t border-cobalt-mid pt-6 lg:mt-12"
            >
              <p className="text-2xl font-semibold">
                {current.title}{' '}
                <span
                  lang="zh"
                  className="font-brush ms-2 text-xl font-normal text-wash"
                >
                  {current.hanzi}
                </span>
              </p>
              <p className="mt-1 text-sm text-wash-strong">
                {copy.levelWord} {current.number} · {current.price}
              </p>
              <p className="mt-3 leading-relaxed text-wash">
                {current.summary}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-wash-strong">{current.topics.join(' · ')}</p>
                <Link
                  href={current.href}
                  className="text-glaze underline decoration-wash-strong underline-offset-4 hover:decoration-glaze"
                >
                  {copy.viewLevel}
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="order-1 flex justify-center lg:order-2">
          <div className="relative aspect-square w-[min(80vw,46vw+12rem,720px)] drop-shadow-[0_34px_40px_rgb(3_10_40/0.55)] @container">
            {/* the plate turns as one painted object */}
            <div
              className="absolute inset-0 transition-transform duration-[1100ms] ease-glaze"
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              <PlateArt
                panels={levels.length}
                activeIndex={current ? selected : -1}
                sign={sign}
              />
              {levels.length > 0 ? (
                <div
                  role="radiogroup"
                  aria-label={copy.levelsLabel}
                  onKeyDown={onKey}
                  className="absolute inset-0 grid place-items-center"
                >
                  {levels.map((level, index) => {
                    const angle = index * step * sign;
                    const active = index === selected;
                    return (
                      <button
                        key={level.slug}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={`${copy.levelWord} ${level.number}: ${level.title}`}
                        tabIndex={active ? 0 : -1}
                        onClick={() => setSelected(index)}
                        className={`relative flex h-[12cqw] w-[18cqw] flex-col items-center justify-center rounded-[40%] text-center transition-[transform,color] duration-[1100ms] ease-glaze [grid-area:1/1] ${
                          active
                            ? 'text-glaze'
                            : 'text-deep hover:text-cobalt-mid'
                        }`}
                        style={{
                          transform: `rotate(${angle}deg) translateY(-${panelOffset}) rotate(${-angle - rotation}deg)`,
                        }}
                      >
                        <span className="whitespace-nowrap text-[max(0.7rem,2.2cqw)] font-semibold leading-tight">
                          <span className="@max-[28rem]:hidden">
                            {copy.levelWord}{' '}
                          </span>
                          <span className="tabular @max-[28rem]:text-base">
                            {level.number}
                          </span>
                        </span>
                        <span
                          lang="zh"
                          className="font-brush text-[max(0.85rem,3.1cqw)] leading-tight"
                        >
                          {level.hanzi}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* the well stays upright: the teacher at the centre */}
            <div
              className="absolute overflow-hidden rounded-full bg-cobalt"
              style={{ inset: wellInset }}
            >
              {portraitSrc ? (
                <Image
                  src={portraitSrc}
                  alt={copy.portraitAlt}
                  fill
                  sizes="(min-width: 1024px) 380px, 42vw"
                  className="object-cover opacity-90 mix-blend-luminosity"
                  priority
                />
              ) : (
                <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_50%_38%,var(--color-wash-strong),var(--color-cobalt)_72%)] text-center">
                  <div>
                    <span
                      lang="zh"
                      aria-hidden="true"
                      className="font-brush block text-[17cqw] leading-none text-glaze/90"
                    >
                      马
                    </span>
                    <span className="mt-2 block px-6 text-[max(0.72rem,2cqw)] leading-snug text-glaze">
                      {copy.portraitPlaceholder}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
