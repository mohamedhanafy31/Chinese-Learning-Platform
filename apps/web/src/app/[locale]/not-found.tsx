import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

import type { Locale } from '@app/shared';

export default async function NotFoundPage(): Promise<React.JSX.Element> {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('NotFound');

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-20 text-center sm:px-8 lg:py-24">
      <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-deep">
        {t('title')}
      </h1>
      <p className="mx-auto mt-5 max-w-[34rem] text-lg leading-[1.8] text-cobalt">
        {t('body')}
      </p>
      <Link
        href={`/${locale}`}
        className="mt-8 inline-flex min-h-14 items-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt"
      >
        {t('home')}
      </Link>
    </section>
  );
}
