import { z } from 'zod';

export { z };

export const Locale = {
  AR: 'ar',
  EN: 'en',
  ZH: 'zh',
} as const;

export type Locale = (typeof Locale)[keyof typeof Locale];

/** Fallback language for course content when a translation is missing. */
export const DEFAULT_LOCALE: Locale = Locale.EN;
/** Interface language for visitors with no matching language preference. */
export const DEFAULT_UI_LOCALE: Locale = Locale.AR;
export const RTL_LOCALES = [Locale.AR] as const satisfies readonly Locale[];

export const localizedTextSchema = z.object({
  ar: z.string().optional(),
  en: z.string(),
  zh: z.string().optional(),
});

export type LocalizedText = z.infer<typeof localizedTextSchema>;
