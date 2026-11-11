import { Archive } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { LogoutButton } from '@/components/auth/logout-button';
import { WriteOn } from '@/components/motion/write-on';
import { getMyLevels } from '@/lib/learning';
import { pick } from '@/lib/localized';
import { numberFormat } from '@/lib/numbers';
import { requireUser } from '@/lib/protected-session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('dashboard'), robots: { index: false, follow: false } };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, `/${locale}/dashboard`);
  const t = await getTranslations('Dashboard');
  const result = await getMyLevels();
  const nf = numberFormat(locale);

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-20 sm:px-8 lg:py-24">
      <h1 className="font-display text-balance text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-deep">
        {t('greeting', { name: user.name })}
      </h1>

      <div className="mt-14 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.1] text-deep">
          <WriteOn text={t('myLevels')} />
        </h2>
        <Link
          href={`/${locale}/orders`}
          className="inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-8 hover:text-deep"
        >
          {t('myOrders')}
        </Link>
      </div>

      {result.status === 'error' ? (
        <p
          role="alert"
          className="mt-8 rounded-2xl border-s-4 border-deep bg-glaze-shade px-4 py-3 font-semibold leading-relaxed text-deep"
        >
          {t('loadError')}
        </p>
      ) : result.levels.length === 0 ? (
        <div
          data-reveal=""
          className="mt-8 rounded-2xl border-2 border-dashed border-unfired px-6 py-14 text-center"
        >
          <p className="text-lg leading-[1.8] text-unfired-ink">{t('empty')}</p>
          <Link
            href={`/${locale}#levels`}
            className="mt-5 inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-8 hover:text-deep"
          >
            {t('browse')}
          </Link>
        </div>
      ) : (
        <ul
          data-reveal="stagger"
          aria-label={t('myLevels')}
          className="mt-8 border-t-2 border-cobalt"
        >
          {result.levels.map((level) => {
            const title = pick(level.title, locale);
            return (
              <li
                key={level.slug}
                data-reveal-item=""
                className="border-b border-wash"
              >
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 py-6 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:px-2">
                  <span
                    lang="zh"
                    aria-hidden="true"
                    className="font-brush whitespace-nowrap text-4xl leading-none text-cobalt sm:text-5xl"
                  >
                    {level.hanzi}
                  </span>
                  <div className="flex min-w-0 items-center gap-4">
                    {level.coverImage ? (
                      <span className="relative hidden size-16 shrink-0 overflow-hidden rounded-full bg-cobalt sm:block">
                        <Image
                          src={level.coverImage.url}
                          alt=""
                          width={level.coverImage.width}
                          height={level.coverImage.height}
                          unoptimized
                          className="size-full object-cover opacity-90 mix-blend-luminosity"
                        />
                      </span>
                    ) : null}
                    <div className="min-w-0">
                      <h3 className="text-xl font-semibold text-deep">
                        {title}
                      </h3>
                      <p className="mt-1 text-sm text-cobalt tabular">
                        {t('lessonsCount', {
                          count: nf.format(level.lessonCount),
                        })}
                      </p>
                      {level.archived ? (
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-unfired px-3 py-1 text-sm font-semibold text-unfired-ink">
                          <Archive
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                          {t('archived')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Link
                      href={`/${locale}/levels/${level.slug}`}
                      aria-label={t('goToLevelNamed', { title })}
                      className="inline-flex min-h-14 items-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt"
                    >
                      {t('goToLevel')}
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-10">
        <LogoutButton
          locale={locale}
          label={t('logout')}
          pendingLabel={t('loggingOut')}
          errorLabel={t('logoutError')}
        />
      </div>
    </section>
  );
}
