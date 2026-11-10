import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { MobileMenu } from '@/components/mobile-menu';
import { Seal } from '@/components/porcelain/seal';

interface SiteHeaderProps {
  locale: Locale;
  tone: 'on-cobalt' | 'on-glaze';
}

export async function SiteHeader({
  locale,
  tone,
}: SiteHeaderProps): Promise<React.JSX.Element> {
  const t = await getTranslations('Nav');
  const brand = await getTranslations('Brand');
  const onCobalt = tone === 'on-cobalt';
  const link = onCobalt
    ? 'text-wash hover:text-glaze'
    : 'text-cobalt hover:text-deep';

  const items = [
    { href: `/${locale}#levels`, label: t('levels') },
    { href: `/${locale}#mazen`, label: t('about') },
    { href: `/${locale}/login`, label: t('login') },
  ];

  return (
    <header
      className={`relative ${onCobalt ? 'bg-deep text-glaze' : 'bg-glaze text-deep'}`}
    >
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-4 py-3 sm:px-8 lg:px-[72px] lg:py-4">
        <Link
          href={`/${locale}`}
          aria-label={brand('home')}
          className="flex items-center gap-3"
        >
          <Seal size={38} />
          <span className="text-lg font-semibold">{brand('name')}</span>
        </Link>

        <nav aria-label={t('label')} className="hidden md:block">
          <ul className="flex items-center gap-1 text-base">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`inline-flex min-h-11 items-center px-3 transition-colors ${link}`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden md:block">
          <LocaleSwitcher currentLocale={locale} label={t('language')} tone={tone} />
        </div>

        <MobileMenu openLabel={t('openMenu')} closeLabel={t('closeMenu')} tone={tone}>
          <nav aria-label={t('label')}>
            <ul className="text-lg">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex min-h-12 items-center transition-colors ${link}`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-3 border-t border-current/20 pt-2">
            <LocaleSwitcher currentLocale={locale} label={t('language')} tone={tone} />
          </div>
        </MobileMenu>
      </div>
    </header>
  );
}
