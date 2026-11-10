import { DEFAULT_UI_LOCALE, Locale } from '@app/shared';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: [Locale.AR, Locale.EN, Locale.ZH],
  defaultLocale: DEFAULT_UI_LOCALE,
  localePrefix: 'always',
});
