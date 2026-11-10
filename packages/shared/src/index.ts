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

export const Role = {
  ADMIN: 'ADMIN',
  STUDENT: 'STUDENT',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const publicUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  phone: z.string(),
  role: z.enum(Role),
});

export type PublicUser = z.infer<typeof publicUserSchema>;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(320));

const passwordSchema = z.string().min(8).max(128);

export const phoneSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/));

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(200),
  phone: phoneSchema,
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
  locale: z.enum(Locale).default(Locale.AR),
});

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(32).max(512),
  password: passwordSchema,
});

export const userResponseSchema = z.object({ user: publicUserSchema });

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;

export const localizedTextSchema = z.object({
  ar: z.string().optional(),
  en: z.string(),
  zh: z.string().optional(),
});

export type LocalizedText = z.infer<typeof localizedTextSchema>;
