import { MAX_PRICE_MINOR, type Locale } from '@app/shared';

export type PriceParseResult =
  | { ok: true; minor: number | null }
  | {
      ok: false;
      reason: 'invalid' | 'decimals' | 'separator' | 'too-large';
    };

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

function toAsciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const codePoint = digit.codePointAt(0) ?? 0;
    const zero =
      codePoint >= EXTENDED_ARABIC_INDIC_ZERO
        ? EXTENDED_ARABIC_INDIC_ZERO
        : ARABIC_INDIC_ZERO;
    return String(codePoint - zero);
  });
}

/**
 * Converts what the admin typed (EGP, as a decimal string) into integer
 * piasters by string parsing only, never float math.
 *
 * Rules:
 * - Empty input means "price not announced" and returns `null`.
 * - Western, Arabic-Indic and Persian digits are accepted.
 * - The decimal separator is "." (or the Arabic decimal separator "٫").
 * - At most two decimals; zero is a valid price.
 * - Thousands separators ("1,000", "1٬000") and decimal commas are rejected
 *   rather than guessed at: "1,000" could mean one thousand or one.
 * - Signs, exponents, spaces inside the number and anything else are invalid.
 */
export function parsePriceInput(raw: string): PriceParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, minor: null };

  const normalised = toAsciiDigits(trimmed).replace('٫', '.');
  if (/[,٬،]/.test(normalised)) return { ok: false, reason: 'separator' };

  const match = /^(\d+)(?:\.(\d*))?$/.exec(normalised);
  if (!match) return { ok: false, reason: 'invalid' };
  const whole = match[1] ?? '';
  const fraction = match[2];
  if (fraction !== undefined && fraction.length === 0) {
    return { ok: false, reason: 'invalid' };
  }
  if ((fraction ?? '').length > 2) return { ok: false, reason: 'decimals' };

  const wholeDigits = whole.replace(/^0+(?=\d)/, '');
  if (wholeDigits.length > 9) return { ok: false, reason: 'too-large' };
  const minor =
    Number(wholeDigits) * 100 + Number((fraction ?? '').padEnd(2, '0'));
  if (minor > MAX_PRICE_MINOR) return { ok: false, reason: 'too-large' };
  return { ok: true, minor };
}

/** Inverse of {@link parsePriceInput} for editing: 1050 becomes "10.50". */
export function priceToInput(minor: number | null): string {
  if (minor === null) return '';
  const whole = Math.trunc(minor / 100);
  const remainder = minor % 100;
  return remainder === 0
    ? String(whole)
    : `${whole}.${String(remainder).padStart(2, '0')}`;
}

/**
 * Display text for a price in EGP. The decimal string is assembled with
 * integer arithmetic and handed to Intl as an exact decimal, so there is no
 * float rounding. Whole-pound prices show no decimals.
 */
export function formatEgp(minor: number, locale: Locale): string {
  const whole = Math.trunc(minor / 100);
  const remainder = minor % 100;
  const hasFraction = remainder !== 0;
  const decimal = hasFraction
    ? `${whole}.${String(remainder).padStart(2, '0')}`
    : String(whole);
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : locale, {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(decimal as `${number}`);
}
