import Link from 'next/link';

import { Locale, type Locale as LocaleCode } from '@app/shared';

export const localeLabels: Record<LocaleCode, string> = {
  [Locale.AR]: 'العربية',
  [Locale.EN]: 'English',
  [Locale.ZH]: '中文',
};

interface LocaleSwitcherProps {
  currentLocale: LocaleCode;
  label: string;
  /** Visual tone: on the cobalt field or on glaze white. */
  tone?: 'on-cobalt' | 'on-glaze';
}

export function LocaleSwitcher({
  currentLocale,
  label,
  tone = 'on-glaze',
}: LocaleSwitcherProps): React.JSX.Element {
  const idle =
    tone === 'on-cobalt'
      ? 'text-wash hover:text-glaze'
      : 'text-cobalt hover:text-deep';
  const active =
    tone === 'on-cobalt'
      ? 'text-glaze underline decoration-seal decoration-2 underline-offset-8'
      : 'text-deep underline decoration-seal decoration-2 underline-offset-8';

  return (
    <nav aria-label={label}>
      <ul className="flex items-center gap-1 text-sm">
        {Object.values(Locale).map((locale) => (
          <li key={locale}>
            {locale === currentLocale ? (
              <span
                aria-current="page"
                lang={locale}
                className={`inline-flex min-h-11 items-center px-2 ${active}`}
              >
                {localeLabels[locale]}
              </span>
            ) : (
              <Link
                href={`/${locale}`}
                hrefLang={locale}
                lang={locale}
                prefetch={false}
                className={`inline-flex min-h-11 items-center px-2 transition-colors ${idle}`}
              >
                {localeLabels[locale]}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
