import type { Locale } from '@app/shared';

/** Arabic UI uses Eastern Arabic digits, as Egyptian readers expect. */
export function numberFormat(locale: Locale): Intl.NumberFormat {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : locale);
}
