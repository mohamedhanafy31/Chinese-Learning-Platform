import { getTranslations } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { Seal } from '@/components/porcelain/seal';

export async function SiteFooter({
  locale,
}: {
  locale: Locale;
}): Promise<React.JSX.Element> {
  const t = await getTranslations('Home');
  const brand = await getTranslations('Brand');
  const nav = await getTranslations('Nav');

  return (
    <footer className="bg-abyss text-wash">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-6 px-4 py-10 sm:px-8 lg:px-[72px]">
        <div className="flex items-center gap-3">
          <Seal size={32} />
          <div>
            <p className="font-semibold text-glaze">
              {brand('name')}{' '}
              <span lang="zh" className="font-brush ms-1 text-wash-strong">
                {brand('nameZh')}
              </span>
            </p>
            <p className="text-sm">{t('footer')}</p>
          </div>
        </div>
        <LocaleSwitcher currentLocale={locale} label={nav('language')} tone="on-cobalt" />
      </div>
    </footer>
  );
}
