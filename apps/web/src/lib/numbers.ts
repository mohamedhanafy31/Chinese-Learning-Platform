import type { Locale } from '@app/shared';

/** Arabic UI uses Eastern Arabic digits, as Egyptian readers expect. */
export function numberFormat(locale: Locale): Intl.NumberFormat {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : locale);
}

/** Whole-percent score formatter ("٨٠٪" in Arabic); pass the 0-100 value. */
export function formatPercent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value / 100);
}
