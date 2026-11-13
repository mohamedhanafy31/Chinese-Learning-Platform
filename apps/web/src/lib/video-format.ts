import type { Locale } from '@app/shared';

function intlLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-EG' : locale;
}

/**
 * A running time as m:ss, or h:mm:ss from an hour up, with the reader's digits
 * (Eastern Arabic in Arabic). Invalid or negative input reads as 0:00.
 */
export function formatDuration(seconds: number, locale: Locale): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const plain = new Intl.NumberFormat(intlLocale(locale), {
    useGrouping: false,
  });
  const padded = new Intl.NumberFormat(intlLocale(locale), {
    useGrouping: false,
    minimumIntegerDigits: 2,
  });
  return hours > 0
    ? [plain.format(hours), padded.format(minutes), padded.format(rest)].join(
        ':',
      )
    : [plain.format(minutes), padded.format(rest)].join(':');
}

/** A player speed such as "1.25×", with locale-appropriate digits. */
export function formatPlaybackRate(rate: number, locale: Locale): string {
  return `${new Intl.NumberFormat(intlLocale(locale), {
    useGrouping: false,
    maximumFractionDigits: 2,
  }).format(rate)}×`;
}

/** A vertical video resolution such as "1080p", localized like other counts. */
export function formatVideoQuality(height: number, locale: Locale): string {
  const safe = Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0;
  return `${new Intl.NumberFormat(intlLocale(locale), {
    useGrouping: false,
  }).format(safe)}p`;
}

const UNITS = [
  { limit: 1024, unit: 'byte', divisor: 1 },
  { limit: 1024 ** 2, unit: 'kilobyte', divisor: 1024 },
  { limit: 1024 ** 3, unit: 'megabyte', divisor: 1024 ** 2 },
  { limit: Infinity, unit: 'gigabyte', divisor: 1024 ** 3 },
] as const;

/** A file size with a localized unit ("12.4 MB", "١٢٫٤ ميغابايت"). */
export function formatFileSize(bytes: number, locale: Locale): string {
  const size = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  const step = UNITS.find((candidate) => size < candidate.limit) ?? UNITS[3];
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'unit',
    unit: step.unit,
    unitDisplay: 'short',
    maximumFractionDigits: step.unit === 'byte' ? 0 : 1,
  }).format(size / step.divisor);
}

/** A 0..1 fraction as a localized percentage ("42%", "٤٢٪"). */
export function formatPercent(fraction: number, locale: Locale): string {
  const clamped = Number.isFinite(fraction)
    ? Math.min(1, Math.max(0, fraction))
    : 0;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(clamped);
}
