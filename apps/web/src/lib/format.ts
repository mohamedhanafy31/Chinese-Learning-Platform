import type { Locale } from '@app/shared';

function intlLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-EG' : locale;
}

/** A calendar date in the reader's language (Eastern Arabic digits in Arabic). */
export function formatDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeZone: 'Africa/Cairo',
  }).format(date);
}

/** Date and time of an attempt, in Cairo time, with locale digits. */
export function formatDateTime(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(date);
}
