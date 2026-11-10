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
  .transform((value) => {
    const asciiDigits = value.replace(/[٠-٩۰-۹]/g, (digit) => {
      const codePoint = digit.codePointAt(0) ?? 0;
      const zero = codePoint >= 0x06f0 ? 0x06f0 : 0x0660;
      return String(codePoint - zero);
    });
    const compact = asciiDigits.replace(/[\s\-()]/g, '');
    const international = compact.startsWith('00')
      ? `+${compact.slice(2)}`
      : compact;

    return /^01[0125]\d{8}$/.test(international)
      ? `+20${international.slice(1)}`
      : international;
  })
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

const localizedStringSchema = z.string().trim().min(1).max(2000);

export const localizedTextSchema = z.object({
  ar: localizedStringSchema.optional(),
  en: localizedStringSchema,
  zh: localizedStringSchema.optional(),
});

export type LocalizedText = z.infer<typeof localizedTextSchema>;

// ---------------------------------------------------------------------------
// Catalog (levels and lessons)
// ---------------------------------------------------------------------------

export const SLUG_MIN_LENGTH = 2;
export const SLUG_MAX_LENGTH = 64;
export const MAX_LEVEL_TOPICS = 12;
export const MAX_PRICE_MINOR = 10_000_000;
export const DEFAULT_CURRENCY = 'EGP';
/** Upper bound on rows in one reorder payload (levels, or lessons per level). */
export const MAX_ORDER_IDS = 500;

export const slugSchema = z
  .string()
  .min(SLUG_MIN_LENGTH)
  .max(SLUG_MAX_LENGTH)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

function codePointLength(value: string): number {
  return Array.from(value).length;
}

const hanziSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => codePointLength(value) <= 8, {
    message: 'Must be at most 8 characters',
  });

/** Integer EGP piasters. `null` means the price has not been announced. */
export const priceMinorSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_PRICE_MINOR)
  .nullable();

export const levelTopicsSchema = z
  .array(localizedTextSchema)
  .max(MAX_LEVEL_TOPICS);

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 2000;
export const MAX_IMAGE_INPUT_SIDE = 12_000;

/** What public and admin catalog payloads carry for an attached image. */
export const imageRefSchema = z.object({
  url: z.string().startsWith('/media/'),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});

export const uploadedImageSchema = imageRefSchema.extend({
  id: z.uuid(),
  mime: z.string(),
  sizeBytes: z.number().int().min(0),
});

export type ImageRef = z.infer<typeof imageRefSchema>;
export type UploadedImage = z.infer<typeof uploadedImageSchema>;

export const createLevelRequestSchema = z.object({
  slug: slugSchema,
  hanzi: hanziSchema,
  title: localizedTextSchema,
  summary: localizedTextSchema,
  topics: levelTopicsSchema.default([]),
  priceMinor: priceMinorSchema.default(null),
  coverImageId: z.uuid().nullable().default(null),
});

export const updateLevelRequestSchema = z.object({
  slug: slugSchema.optional(),
  hanzi: hanziSchema.optional(),
  title: localizedTextSchema.optional(),
  summary: localizedTextSchema.optional(),
  topics: levelTopicsSchema.optional(),
  priceMinor: priceMinorSchema.optional(),
  coverImageId: z.uuid().nullable().optional(),
});

export const createLessonRequestSchema = z.object({
  title: localizedTextSchema,
  description: localizedTextSchema.nullable().default(null),
  hanzi: hanziSchema.nullable().default(null),
  isFreePreview: z.boolean().default(false),
  thumbnailId: z.uuid().nullable().default(null),
});

export const updateLessonRequestSchema = z.object({
  title: localizedTextSchema.optional(),
  description: localizedTextSchema.nullable().optional(),
  hanzi: hanziSchema.nullable().optional(),
  isFreePreview: z.boolean().optional(),
  thumbnailId: z.uuid().nullable().optional(),
});

export const reorderRequestSchema = z.object({
  ids: z.array(z.uuid()).max(MAX_ORDER_IDS),
});

const timestampSchema = z.string();

export const adminLessonSchema = z.object({
  id: z.uuid(),
  levelId: z.uuid(),
  title: localizedTextSchema,
  description: localizedTextSchema.nullable(),
  hanzi: z.string().nullable(),
  sortOrder: z.number().int(),
  isPublished: z.boolean(),
  isFreePreview: z.boolean(),
  thumbnailId: z.uuid().nullable(),
  thumbnail: imageRefSchema.nullable(),
  firstPublishedAt: timestampSchema.nullable(),
  archivedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const adminLevelSchema = z.object({
  id: z.uuid(),
  slug: slugSchema,
  hanzi: z.string(),
  title: localizedTextSchema,
  summary: localizedTextSchema,
  topics: levelTopicsSchema,
  priceMinor: priceMinorSchema,
  currency: z.string(),
  coverImageId: z.uuid().nullable(),
  coverImage: imageRefSchema.nullable(),
  sortOrder: z.number().int(),
  isPublished: z.boolean(),
  firstPublishedAt: timestampSchema.nullable(),
  archivedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  lessonCount: z.number().int().min(0),
});

export const adminLevelDetailSchema = adminLevelSchema.extend({
  lessons: z.array(adminLessonSchema),
});

export const adminLevelsResponseSchema = z.object({
  levels: z.array(adminLevelSchema),
});

export const publicLessonSchema = z.object({
  id: z.uuid(),
  number: z.number().int().min(1),
  title: localizedTextSchema,
  description: localizedTextSchema.nullable(),
  hanzi: z.string().nullable(),
  isFreePreview: z.boolean(),
  thumbnail: imageRefSchema.nullable(),
});

export const publicLevelSchema = z.object({
  slug: slugSchema,
  number: z.number().int().min(1),
  hanzi: z.string(),
  title: localizedTextSchema,
  summary: localizedTextSchema,
  topics: levelTopicsSchema,
  priceMinor: priceMinorSchema,
  currency: z.string(),
  coverImage: imageRefSchema.nullable(),
  lessonCount: z.number().int().min(0),
});

export const publicLevelDetailSchema = publicLevelSchema.extend({
  lessons: z.array(publicLessonSchema),
});

export const publicLevelsResponseSchema = z.object({
  levels: z.array(publicLevelSchema),
});

export type CreateLevelRequest = z.infer<typeof createLevelRequestSchema>;
export type UpdateLevelRequest = z.infer<typeof updateLevelRequestSchema>;
export type CreateLessonRequest = z.infer<typeof createLessonRequestSchema>;
export type UpdateLessonRequest = z.infer<typeof updateLessonRequestSchema>;
export type ReorderRequest = z.infer<typeof reorderRequestSchema>;
export type AdminLesson = z.infer<typeof adminLessonSchema>;
export type AdminLevel = z.infer<typeof adminLevelSchema>;
export type AdminLevelDetail = z.infer<typeof adminLevelDetailSchema>;
export type AdminLevelsResponse = z.infer<typeof adminLevelsResponseSchema>;
export type PublicLesson = z.infer<typeof publicLessonSchema>;
export type PublicLevel = z.infer<typeof publicLevelSchema>;
export type PublicLevelDetail = z.infer<typeof publicLevelDetailSchema>;
export type PublicLevelsResponse = z.infer<typeof publicLevelsResponseSchema>;
