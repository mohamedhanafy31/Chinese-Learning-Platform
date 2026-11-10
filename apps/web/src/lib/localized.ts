import type { Locale, LocalizedText } from '@app/shared';

/** Course text in the UI locale, falling back to English. */
export function pick(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.en;
}

/** The three labelled inputs of one localized field, as raw form strings. */
export interface LocalizedInput {
  ar: string;
  en: string;
  zh: string;
}

export const emptyLocalizedInput: LocalizedInput = { ar: '', en: '', zh: '' };

export function toLocalizedInput(
  text: LocalizedText | null | undefined,
): LocalizedInput {
  return { ar: text?.ar ?? '', en: text?.en ?? '', zh: text?.zh ?? '' };
}

/**
 * Builds the API shape from the three inputs. Blank `ar` and `zh` are omitted
 * (the API rejects empty strings); `en` is always kept so the shared schema
 * reports a missing English value instead of silently dropping the field.
 */
export function fromLocalizedInput(input: LocalizedInput): LocalizedText {
  const result: LocalizedText = { en: input.en.trim() };
  const ar = input.ar.trim();
  const zh = input.zh.trim();
  if (ar) result.ar = ar;
  if (zh) result.zh = zh;
  return result;
}

export function isLocalizedInputBlank(input: LocalizedInput): boolean {
  return !input.ar.trim() && !input.en.trim() && !input.zh.trim();
}
