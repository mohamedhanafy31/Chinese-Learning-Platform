import Link from 'next/link';

import { Locale, type Locale as LocaleCode } from '@app/shared';

const localeLabels: Record<LocaleCode, string> = {
  [Locale.AR]: 'العربية',
  [Locale.EN]: 'English',
  [Locale.ZH]: '中文',
};

interface LocaleSwitcherProps {
  currentLocale: LocaleCode;
  label: string;
}

export function LocaleSwitcher({
  currentLocale,
  label,
}: LocaleSwitcherProps): React.JSX.Element {
  return (
    <nav aria-label={label}>
      <ul>
        {Object.values(Locale).map((locale) => (
          <li key={locale}>
            {locale === currentLocale ? (
              <span aria-current="page">{localeLabels[locale]}</span>
            ) : (
              <Link href={`/${locale}`} hrefLang={locale} lang={locale}>
                {localeLabels[locale]}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
