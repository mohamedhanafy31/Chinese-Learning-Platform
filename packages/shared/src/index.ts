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

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

export const MAX_VIDEO_DURATION_SEC = 36_000;
/** Default and documented ceiling for one local video upload (2 GiB). */
export const DEFAULT_VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export const VideoProvider = {
  LOCAL: 'LOCAL',
  BUNNY: 'BUNNY',
} as const;

export type VideoProvider = (typeof VideoProvider)[keyof typeof VideoProvider];

export const VideoStatus = {
  UPLOADING: 'UPLOADING',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;

export type VideoStatus = (typeof VideoStatus)[keyof typeof VideoStatus];

/** The admin's view of a lesson's current video. */
export const adminVideoSchema = z.object({
  id: z.uuid(),
  provider: z.enum(VideoProvider),
  status: z.enum(VideoStatus),
  mime: z.string().nullable(),
  sizeBytes: z.number().int().min(0).nullable(),
  durationSec: z.number().int().min(0).nullable(),
  originalName: z.string(),
  createdAt: z.string(),
});

/** Upload response: the descriptor plus whether local storage is dev-only. */
export const uploadedVideoSchema = adminVideoSchema.extend({
  devOnly: z.boolean(),
});

export const providerReadinessSchema = z.object({
  bunny: z.object({
    configured: z.boolean(),
    missing: z.array(z.string()),
  }),
  active: z.enum(['LOCAL', 'BUNNY']),
});

export const videoDiagnosticsSchema = providerReadinessSchema.extend({
  devOnly: z.boolean(),
  missingLocalFiles: z.number().int().min(0).default(0),
  embedTokens: z
    .object({
      status: z.enum([
        'enforced',
        'not-enforced',
        'unknown',
        'no-video',
        'not-configured',
      ]),
      checkedAt: z.string().nullable(),
    })
    .default({ status: 'not-configured', checkedAt: null }),
  /** Asset counts by provider and state; no secrets, no ids. */
  counts: z.object({
    local: z.number().int().min(0),
    bunny: z.number().int().min(0),
    processing: z.number().int().min(0),
    failed: z.number().int().min(0),
    pendingDeletes: z.number().int().min(0).default(0),
  }),
  /** When Bunny last called the webhook, or null if it never has. */
  lastWebhookAt: z.string().nullable(),
});

/** A newer asset that is uploading, processing or failed, beside the active one. */
export const pendingVideoSchema = z.object({
  id: z.uuid(),
  status: z.enum(VideoStatus),
  failureReason: z.string().optional(),
  createdAt: z.string(),
});

/** Metadata the browser sends before a direct-to-Bunny TUS upload. */
export const createBunnyUploadRequestSchema = z.object({
  originalName: z.string().min(1).max(255),
  sizeBytes: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  durationSec: z.number().int().min(1).max(MAX_VIDEO_DURATION_SEC).optional(),
});

/** What the browser needs to start a TUS upload; never the library API key. */
export const bunnyUploadTicketSchema = z.object({
  assetId: z.uuid(),
  tus: z.object({
    endpoint: z.string(),
    headers: z.object({
      AuthorizationSignature: z.string(),
      AuthorizationExpire: z.string(),
      VideoId: z.string(),
      LibraryId: z.string(),
    }),
  }),
  metadata: z.object({ filetype: z.string(), title: z.string() }),
});

export const uploadVideoFieldsSchema = z.object({
  durationSec: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.number().int().min(1).max(MAX_VIDEO_DURATION_SEC).optional(),
  ),
});

// ---------------------------------------------------------------------------
// Progress (watch coverage, completion, sequence)
// ---------------------------------------------------------------------------

/**
 * How a lesson shows on a path: `done` and `next` come from the sequence for
 * an enrolled learner, `preview` is a free lesson, `open` is staff access.
 */
export const lessonAccessSchema = z.enum([
  'open',
  'preview',
  'locked',
  'done',
  'next',
]);

/** A lesson is "complete" at this share of the video watched (and quizzes). */
export const VIDEO_COMPLETE_PERCENT = 90;
export const MAX_PROGRESS_SEGMENTS = 20;
export const MAX_PROGRESS_SECONDS = 36_000;

const progressSecondSchema = z
  .number()
  .min(0)
  .max(MAX_PROGRESS_SECONDS)
  .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-6, {
    message: 'At most one decimal',
  });

/** One watched range `[from, to]` in seconds (integers or one decimal). */
export const progressSegmentSchema = z.tuple([
  progressSecondSchema,
  progressSecondSchema,
]);

export const reportProgressRequestSchema = z.object({
  segments: z.array(progressSegmentSchema).max(MAX_PROGRESS_SEGMENTS),
  positionSec: z
    .number()
    .min(0)
    .max(MAX_PROGRESS_SECONDS * 10),
  /** The player's own duration; only used when the asset has none stored. */
  durationSec: z
    .number()
    .min(0)
    .max(MAX_PROGRESS_SECONDS * 10)
    .optional(),
});

export const progressReportResponseSchema = z.object({
  watchedPercent: z.number().int().min(0).max(100),
  videoComplete: z.boolean(),
  complete: z.boolean(),
  nextLessonId: z.uuid().nullable(),
});

/** What the signed-in learner has done in one lesson. */
export const lessonProgressSchema = z.object({
  watchedPercent: z.number().int().min(0).max(100),
  lastPositionSec: z.number().int().min(0),
  videoComplete: z.boolean(),
  complete: z.boolean(),
  quizzes: z.object({
    total: z.number().int().min(0),
    passed: z.number().int().min(0),
  }),
  /** Whether the lesson has a video the learner must watch. */
  hasVideo: z.boolean(),
  nextLessonId: z.uuid().nullable(),
});

export const playbackLessonSchema = z.object({
  id: z.uuid(),
  number: z.number().int().min(1),
  title: localizedTextSchema,
  description: localizedTextSchema.nullable(),
  hanzi: z.string().nullable(),
});

export const playbackLevelSchema = z.object({
  slug: slugSchema,
  hanzi: z.string(),
  title: localizedTextSchema,
});

export const playbackSiblingSchema = z.object({
  id: z.uuid(),
  number: z.number().int().min(1),
  title: localizedTextSchema,
  hanzi: z.string().nullable(),
  access: lessonAccessSchema,
});

const playbackContextShape = {
  lesson: playbackLessonSchema,
  level: playbackLevelSchema,
  poster: z.string().startsWith('/media/').nullable(),
  siblings: z.array(playbackSiblingSchema),
  /** The signed-in viewer's progress; null for anonymous viewers. */
  progress: lessonProgressSchema.nullable(),
};

export const localPlaybackSchema = z.object({
  provider: z.literal(VideoProvider.LOCAL),
  src: z.string().startsWith('/'),
  mime: z.string().nullable(),
  durationSec: z.number().int().min(0).nullable(),
});

/** A signed, expiring Bunny embed the lesson page puts in an iframe. */
export const bunnyPlaybackSchema = z.object({
  provider: z.literal(VideoProvider.BUNNY),
  embedUrl: z.url(),
  expiresAt: z.string(),
  durationSec: z.number().int().min(0).nullable(),
});

export const playbackVideoSchema = z.discriminatedUnion('provider', [
  localPlaybackSchema,
  bunnyPlaybackSchema,
]);

export const playbackResponseSchema = z.object({
  ...playbackContextShape,
  video: playbackVideoSchema,
});

/** The 404 body when the lesson is open to the viewer but has no video yet. */
export const playbackNoVideoSchema = z.object({
  reason: z.literal('no-video'),
  ...playbackContextShape,
});

/** The 401/403 body: why the viewer is refused, and the level to offer. */
export const playbackDeniedSchema = z.object({
  reason: z.enum(['login-required', 'not-enrolled', 'sequence-locked']),
  levelSlug: slugSchema.optional(),
  /** For `sequence-locked`: the earlier lesson to finish first. */
  requiredLessonId: z.uuid().optional(),
});

export type AdminVideo = z.infer<typeof adminVideoSchema>;
export type PendingVideo = z.infer<typeof pendingVideoSchema>;
export type CreateBunnyUploadRequest = z.infer<
  typeof createBunnyUploadRequestSchema
>;
export type BunnyUploadTicket = z.infer<typeof bunnyUploadTicketSchema>;
export type PlaybackVideo = z.infer<typeof playbackVideoSchema>;
export type UploadedVideo = z.infer<typeof uploadedVideoSchema>;
export type ProviderReadiness = z.infer<typeof providerReadinessSchema>;
export type VideoDiagnostics = z.infer<typeof videoDiagnosticsSchema>;
export type PlaybackResponse = z.infer<typeof playbackResponseSchema>;
export type PlaybackNoVideo = z.infer<typeof playbackNoVideoSchema>;
export type PlaybackDenied = z.infer<typeof playbackDeniedSchema>;

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
  video: adminVideoSchema.nullable(),
  /** A newer upload still in flight (or failed) next to the active video. */
  pendingVideo: pendingVideoSchema.nullable(),
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
  id: z.uuid(),
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

// ---------------------------------------------------------------------------
// Billing (checkout, learner orders, admin orders)
// ---------------------------------------------------------------------------

export const OrderStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  EXPIRED: 'EXPIRED',
  CANCELED: 'CANCELED',
  REFUNDED: 'REFUNDED',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const billingAvailabilitySchema = z.object({ available: z.boolean() });

export const checkoutRequestSchema = z.object({
  levelId: z.uuid(),
  locale: z.enum(Locale).default(Locale.AR),
});

export const checkoutResponseSchema = z.object({
  orderId: z.uuid(),
  checkoutUrl: z.url(),
  expiresAt: timestampSchema,
});

export const orderSummarySchema = z.object({
  id: z.uuid(),
  status: z.enum(OrderStatus),
  levelId: z.uuid(),
  levelSlug: slugSchema,
  levelTitle: localizedTextSchema,
  amountMinor: z.number().int().min(0),
  currency: z.string(),
  createdAt: timestampSchema,
  paidAt: timestampSchema.nullable(),
  expiresAt: timestampSchema,
});

export const ownOrdersResponseSchema = z.object({
  orders: z.array(orderSummarySchema),
});

export const adminOrderSummarySchema = orderSummarySchema.extend({
  hasActiveAccess: z.boolean().default(false),
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    phone: z.string(),
  }),
});

export const adminOrdersResponseSchema = z.object({
  orders: z.array(adminOrderSummarySchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});

export const adminOrdersQuerySchema = z.object({
  status: z.enum(OrderStatus).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  refundedWithAccess: z.preprocess(
    (value) => value === 'true' || value === true,
    z.boolean().optional(),
  ),
});

export const adminPaymentTransactionSchema = z.object({
  id: z.uuid(),
  providerTransactionId: z.string(),
  integrationId: z.string(),
  success: z.boolean(),
  pending: z.boolean(),
  isRefund: z.boolean(),
  isVoided: z.boolean(),
  amountMinor: z.number().int().min(0),
  currency: z.string(),
  payloadRedacted: z.unknown(),
  occurredAt: timestampSchema,
  createdAt: timestampSchema,
});

export const adminOrderDetailSchema = adminOrderSummarySchema.extend({
  specialReference: z.string(),
  paymobIntentionId: z.string().nullable(),
  paymobOrderId: z.string().nullable(),
  transactions: z.array(adminPaymentTransactionSchema),
});

export const billingReportSchema = z.object({
  since: timestampSchema,
  callbacksWithMismatches: z.number().int().min(0),
  callbacksWithoutMatchingOrder: z.number().int().min(0),
  paidOrdersWithoutEnrollment: z.number().int().min(0),
});

export type BillingAvailability = z.infer<typeof billingAvailabilitySchema>;
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
export type OrderSummary = z.infer<typeof orderSummarySchema>;
export type OwnOrdersResponse = z.infer<typeof ownOrdersResponseSchema>;
export type AdminOrderSummary = z.infer<typeof adminOrderSummarySchema>;
export type AdminOrdersResponse = z.infer<typeof adminOrdersResponseSchema>;
export type AdminPaymentTransaction = z.infer<
  typeof adminPaymentTransactionSchema
>;
export type AdminOrderDetail = z.infer<typeof adminOrderDetailSchema>;
export type BillingReport = z.infer<typeof billingReportSchema>;

// ---------------------------------------------------------------------------
// Audit log and admin overview
// ---------------------------------------------------------------------------

/** Entities an audit row can point at (the `entity` column). */
export const AuditEntity = {
  LEVEL: 'Level',
  LESSON: 'Lesson',
  QUIZ: 'Quiz',
  STUDENT: 'Student',
  IMAGE: 'Image',
} as const;

export type AuditEntity = (typeof AuditEntity)[keyof typeof AuditEntity];

export const AUDIT_PAGE_SIZE = 25;
export const MAX_AUDIT_PAGE_SIZE = 50;
export const MAX_AUDIT_TEXT_LENGTH = 200;

const auditEmptyToUndefined = (value: unknown): unknown =>
  value === '' ? undefined : value;

const auditText = z.preprocess(
  auditEmptyToUndefined,
  z.string().trim().min(1).max(MAX_AUDIT_TEXT_LENGTH).optional(),
);

/** `YYYY-MM-DD` (a Cairo calendar day) or a full ISO timestamp. */
const auditBoundSchema = z.preprocess(
  auditEmptyToUndefined,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/)
    .optional(),
);

export const adminAuditQuerySchema = z.object({
  entity: auditText,
  entityId: auditText,
  actorId: z.preprocess(auditEmptyToUndefined, z.uuid().optional()),
  /** Free text matched against the actor's name or email. */
  actor: auditText,
  action: auditText,
  from: auditBoundSchema,
  to: auditBoundSchema,
  page: z.preprocess(
    auditEmptyToUndefined,
    z.coerce.number().int().min(1).max(100_000).default(1),
  ),
  pageSize: z.preprocess(
    auditEmptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_AUDIT_PAGE_SIZE)
      .default(AUDIT_PAGE_SIZE),
  ),
});

export const auditEntrySchema = z.object({
  id: z.uuid(),
  createdAt: z.string(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
  /**
   * The entity's current name (level, lesson or quiz title, or a student's
   * name). Null when it cannot be resolved, for example after a delete.
   */
  entityLabel: localizedTextSchema.nullable(),
  actor: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
  }),
  /** Ids and non-secret changed fields only; its shape depends on `action`. */
  data: z.record(z.string(), z.unknown()),
});

export const adminAuditResponseSchema = z.object({
  entries: z.array(auditEntrySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});

export const adminOverviewSchema = z.object({
  students: z.object({
    total: z.number().int().min(0),
    newLast30d: z.number().int().min(0),
  }),
  enrollments: z.object({
    active: z.number().int().min(0),
    purchasedLast30d: z.number().int().min(0),
  }),
  revenueLast30dMinor: z.number().int().min(0),
  pendingOrders: z.number().int().min(0),
  failedCallbacksLast24h: z.number().int().min(0),
  refundedWithAccess: z.number().int().min(0).default(0),
  video: z.object({
    active: z.enum(['LOCAL', 'BUNNY']),
    devOnly: z.boolean(),
  }),
  payments: z.object({ available: z.boolean() }),
});

export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AdminAuditResponse = z.infer<typeof adminAuditResponseSchema>;
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

// ---------------------------------------------------------------------------
// Learning (enrollments, access, students)
// ---------------------------------------------------------------------------

export const EnrollmentSource = {
  PURCHASE: 'PURCHASE',
  ADMIN: 'ADMIN',
} as const;

export type EnrollmentSource =
  (typeof EnrollmentSource)[keyof typeof EnrollmentSource];

export const MAX_REVOKE_REASON_LENGTH = 500;
export const MAX_STUDENTS_PAGE_SIZE = 50;
export const DEFAULT_STUDENTS_PAGE_SIZE = 20;
export const MAX_STUDENT_QUERY_LENGTH = 200;

export const enrollmentSourceSchema = z.enum(EnrollmentSource);

/** Completed lessons of a level and where the learner continues. */
export const levelProgressSchema = z.object({
  completed: z.number().int().min(0),
  total: z.number().int().min(0),
  nextLessonId: z.uuid().nullable(),
});

/** One level a learner owns, as listed on their dashboard. */
export const myLevelSchema = z.object({
  slug: slugSchema,
  /** Public position, or null once the level is archived. */
  number: z.number().int().min(1).nullable(),
  hanzi: z.string(),
  title: localizedTextSchema,
  summary: localizedTextSchema,
  coverImage: imageRefSchema.nullable(),
  lessonCount: z.number().int().min(0),
  archived: z.boolean(),
  enrolledAt: z.string(),
  progress: levelProgressSchema.extend({
    nextLesson: z
      .object({
        id: z.uuid(),
        number: z.number().int().min(1),
        title: localizedTextSchema,
      })
      .nullable(),
    /** Each visible lesson in order, in the sequence's terms. */
    lessons: z.array(z.object({ id: z.uuid(), access: lessonAccessSchema })),
  }),
});

export const myLevelsResponseSchema = z.object({
  levels: z.array(myLevelSchema),
});

/** The full level an enrolled learner may read, archived levels included. */
export const myLevelDetailSchema = myLevelSchema.extend({
  topics: levelTopicsSchema,
  priceMinor: priceMinorSchema,
  currency: z.string(),
  lessons: z.array(publicLessonSchema),
});

export const levelAccessResponseSchema = z.object({
  enrolled: z.boolean(),
  lessons: z.array(z.object({ id: z.uuid(), access: lessonAccessSchema })),
  /** The learner's progress; null unless they are enrolled. */
  progress: levelProgressSchema.nullable(),
});

const emptyToUndefined = (value: unknown): unknown =>
  value === '' ? undefined : value;

export const adminStudentsQuerySchema = z.object({
  query: z.string().trim().max(MAX_STUDENT_QUERY_LENGTH).default(''),
  page: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(100_000).default(1),
  ),
  pageSize: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_STUDENTS_PAGE_SIZE)
      .default(DEFAULT_STUDENTS_PAGE_SIZE),
  ),
});

export const adminStudentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  createdAt: z.string(),
  activeEnrollments: z.number().int().min(0),
  /** False once an admin has deactivated the account. */
  isActive: z.boolean(),
});

export const adminStudentsResponseSchema = z.object({
  students: z.array(adminStudentSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});

export const adminEnrollmentSchema = z.object({
  id: z.uuid(),
  levelId: z.uuid(),
  level: z.object({
    slug: z.string(),
    hanzi: z.string(),
    title: localizedTextSchema,
  }),
  source: enrollmentSourceSchema,
  grantedByName: z.string().nullable(),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
  revokeReason: z.string().nullable(),
  /** Completed and total visible lessons; null once the enrollment is revoked. */
  progress: z
    .object({
      completed: z.number().int().min(0),
      total: z.number().int().min(0),
    })
    .nullable(),
});

export const adminStudentDetailSchema = adminStudentSchema.extend({
  enrollments: z.array(adminEnrollmentSchema),
  orders: z.array(orderSummarySchema),
  /** The latest audit entries about this student (at most 10). */
  recentAudit: z.array(auditEntrySchema),
});

export const grantEnrollmentRequestSchema = z.object({
  levelId: z.uuid(),
});

export const revokeEnrollmentRequestSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(MAX_REVOKE_REASON_LENGTH)
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .default({ reason: undefined });

export type MyLevel = z.infer<typeof myLevelSchema>;
export type MyLevelsResponse = z.infer<typeof myLevelsResponseSchema>;
export type MyLevelDetail = z.infer<typeof myLevelDetailSchema>;
export type LessonAccess = z.infer<typeof lessonAccessSchema>;
export type LevelProgress = z.infer<typeof levelProgressSchema>;
export type ProgressSegment = z.infer<typeof progressSegmentSchema>;
export type ReportProgressRequest = z.infer<typeof reportProgressRequestSchema>;
export type ProgressReportResponse = z.infer<
  typeof progressReportResponseSchema
>;
export type LessonProgress = z.infer<typeof lessonProgressSchema>;
export type LevelAccessResponse = z.infer<typeof levelAccessResponseSchema>;
export type AdminStudentsQuery = z.infer<typeof adminStudentsQuerySchema>;
export type AdminStudent = z.infer<typeof adminStudentSchema>;
export type AdminStudentsResponse = z.infer<typeof adminStudentsResponseSchema>;
export type AdminEnrollment = z.infer<typeof adminEnrollmentSchema>;
export type AdminStudentDetail = z.infer<typeof adminStudentDetailSchema>;
export type GrantEnrollmentRequest = z.infer<
  typeof grantEnrollmentRequestSchema
>;
export type RevokeEnrollmentRequest = z.infer<
  typeof revokeEnrollmentRequestSchema
>;

// ---------------------------------------------------------------------------
// Assessment (quizzes, questions, attempts)
// ---------------------------------------------------------------------------

export const QuestionType = {
  SINGLE: 'SINGLE',
  MULTIPLE: 'MULTIPLE',
  TRUE_FALSE: 'TRUE_FALSE',
} as const;

export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

export const DEFAULT_PASSING_SCORE = 70;
export const MIN_QUESTION_OPTIONS = 2;
export const MAX_QUESTION_OPTIONS = 8;
export const MAX_QUESTION_HANZI_LENGTH = 200;
export const MIN_QUESTION_POINTS = 1;
export const MAX_QUESTION_POINTS = 100;
/** Sanity ceiling on a question write; the real 2..8 rule is enforced as a 422. */
export const MAX_OPTIONS_PAYLOAD = 50;
/** Upper bound on answers in one attempt submission. */
export const MAX_ATTEMPT_ANSWERS = 500;

/** Image attached to a question; the id lets the admin builder keep it. */
export const questionImageSchema = imageRefSchema.extend({ id: z.uuid() });

const passingScoreSchema = z.number().int().min(0).max(100);

const questionHanziSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => codePointLength(value) <= MAX_QUESTION_HANZI_LENGTH, {
    message: `Must be at most ${MAX_QUESTION_HANZI_LENGTH} characters`,
  });

const questionPointsSchema = z
  .number()
  .int()
  .min(MIN_QUESTION_POINTS)
  .max(MAX_QUESTION_POINTS);

export const createQuizRequestSchema = z.object({
  title: localizedTextSchema,
  description: localizedTextSchema.nullable().default(null),
  passingScore: passingScoreSchema.default(DEFAULT_PASSING_SCORE),
});

export const updateQuizRequestSchema = z.object({
  title: localizedTextSchema.optional(),
  description: localizedTextSchema.nullable().optional(),
  passingScore: passingScoreSchema.optional(),
});

export const questionOptionInputSchema = z.object({
  text: localizedTextSchema,
  isCorrect: z.boolean(),
});

/**
 * Create and replace share one body. Option counts and the correct-answer
 * rules per type are domain rules (422 `invalid-options`), not shape rules.
 */
export const questionRequestSchema = z.object({
  type: z.enum(QuestionType),
  prompt: localizedTextSchema,
  hanzi: questionHanziSchema.nullable().default(null),
  imageId: z.uuid().nullable().default(null),
  explanation: localizedTextSchema.nullable().default(null),
  points: questionPointsSchema.default(MIN_QUESTION_POINTS),
  options: z
    .array(questionOptionInputSchema)
    .max(MAX_OPTIONS_PAYLOAD)
    .default([]),
  /**
   * TRUE_FALSE only, and only when `options` is empty: whether "True" is the
   * correct answer. The API then creates the localized True/False options.
   */
  correctAnswer: z.boolean().nullable().default(null),
});

export const adminQuizSummarySchema = z.object({
  id: z.uuid(),
  lessonId: z.uuid(),
  title: localizedTextSchema,
  description: localizedTextSchema.nullable(),
  passingScore: passingScoreSchema,
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable(),
  questionCount: z.number().int().min(0),
  totalPoints: z.number().int().min(0),
  attemptCount: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const adminQuizzesResponseSchema = z.object({
  quizzes: z.array(adminQuizSummarySchema),
});

export const adminOptionSchema = z.object({
  id: z.uuid(),
  text: localizedTextSchema,
  isCorrect: z.boolean(),
  sortOrder: z.number().int(),
});

export const adminQuestionSchema = z.object({
  id: z.uuid(),
  quizId: z.uuid(),
  type: z.enum(QuestionType),
  prompt: localizedTextSchema,
  hanzi: z.string().nullable(),
  imageId: z.uuid().nullable(),
  image: questionImageSchema.nullable(),
  explanation: localizedTextSchema.nullable(),
  points: questionPointsSchema,
  sortOrder: z.number().int(),
  options: z.array(adminOptionSchema),
});

export const adminQuizDetailSchema = adminQuizSummarySchema.extend({
  questions: z.array(adminQuestionSchema),
});

/** Learner view of a quiz row in a lesson's list. */
export const learnerQuizSummarySchema = z.object({
  id: z.uuid(),
  title: localizedTextSchema,
  description: localizedTextSchema.nullable(),
  passingScore: passingScoreSchema,
  questionCount: z.number().int().min(1),
  totalPoints: z.number().int().min(1),
  best: z
    .object({
      score: z.number().int().min(0).max(100),
      passed: z.boolean(),
      createdAt: z.string(),
    })
    .nullable(),
  attempts: z.number().int().min(0),
});

export const learnerQuizzesResponseSchema = z.object({
  quizzes: z.array(learnerQuizSummarySchema),
});

/** An option as the learner sees it: never says whether it is correct. */
export const learnerOptionSchema = z.object({
  id: z.uuid(),
  text: localizedTextSchema,
});

export const learnerQuestionSchema = z.object({
  id: z.uuid(),
  type: z.enum(QuestionType),
  prompt: localizedTextSchema,
  hanzi: z.string().nullable(),
  image: questionImageSchema.nullable(),
  points: questionPointsSchema,
  options: z.array(learnerOptionSchema),
});

export const learnerQuizSchema = z.object({
  id: z.uuid(),
  lessonId: z.uuid(),
  title: localizedTextSchema,
  description: localizedTextSchema.nullable(),
  passingScore: passingScoreSchema,
  questionCount: z.number().int().min(1),
  totalPoints: z.number().int().min(1),
  questions: z.array(learnerQuestionSchema),
});

export const attemptAnswerSchema = z.object({
  questionId: z.uuid(),
  optionIds: z.array(z.uuid()).max(MAX_QUESTION_OPTIONS),
});

export const submitAttemptRequestSchema = z.object({
  answers: z.array(attemptAnswerSchema).max(MAX_ATTEMPT_ANSWERS),
});

export const attemptSummarySchema = z.object({
  id: z.uuid(),
  score: z.number().int().min(0).max(100),
  earnedPoints: z.number().int().min(0),
  totalPoints: z.number().int().min(1),
  passed: z.boolean(),
  createdAt: z.string(),
});

export const attemptResultSchema = z.object({
  questionId: z.uuid(),
  correct: z.boolean(),
  chosen: z.array(z.uuid()),
  correctOptionIds: z.array(z.uuid()),
  explanation: localizedTextSchema.nullable(),
});

export const submitAttemptResponseSchema = z.object({
  attempt: attemptSummarySchema,
  results: z.array(attemptResultSchema),
});

export const attemptsResponseSchema = z.object({
  attempts: z.array(attemptSummarySchema),
});

/** What `QuizAttempt.snapshot` stores (version 1). */
export const attemptSnapshotQuestionSchema = z.object({
  id: z.uuid(),
  type: z.enum(QuestionType),
  prompt: localizedTextSchema,
  hanzi: z.string().nullable(),
  points: questionPointsSchema,
  explanation: localizedTextSchema.nullable(),
  options: z.array(
    z.object({
      id: z.uuid(),
      text: localizedTextSchema,
      isCorrect: z.boolean(),
    }),
  ),
  chosen: z.array(z.uuid()),
  correct: z.boolean(),
});

export const attemptSnapshotSchema = z.object({
  version: z.literal(1),
  passingScore: passingScoreSchema,
  questions: z.array(attemptSnapshotQuestionSchema),
});

export const attemptDetailSchema = z.object({
  attempt: attemptSummarySchema.extend({
    quizId: z.uuid(),
    passingScore: passingScoreSchema,
  }),
  questions: z.array(attemptSnapshotQuestionSchema),
});

export type QuestionImage = z.infer<typeof questionImageSchema>;
export type CreateQuizRequest = z.infer<typeof createQuizRequestSchema>;
export type UpdateQuizRequest = z.infer<typeof updateQuizRequestSchema>;
export type QuestionOptionInput = z.infer<typeof questionOptionInputSchema>;
export type QuestionRequest = z.infer<typeof questionRequestSchema>;
export type AdminQuizSummary = z.infer<typeof adminQuizSummarySchema>;
export type AdminQuizzesResponse = z.infer<typeof adminQuizzesResponseSchema>;
export type AdminOption = z.infer<typeof adminOptionSchema>;
export type AdminQuestion = z.infer<typeof adminQuestionSchema>;
export type AdminQuizDetail = z.infer<typeof adminQuizDetailSchema>;
export type LearnerQuizSummary = z.infer<typeof learnerQuizSummarySchema>;
export type LearnerQuizzesResponse = z.infer<
  typeof learnerQuizzesResponseSchema
>;
export type LearnerOption = z.infer<typeof learnerOptionSchema>;
export type LearnerQuestion = z.infer<typeof learnerQuestionSchema>;
export type LearnerQuiz = z.infer<typeof learnerQuizSchema>;
export type AttemptAnswer = z.infer<typeof attemptAnswerSchema>;
export type SubmitAttemptRequest = z.infer<typeof submitAttemptRequestSchema>;
export type AttemptSummary = z.infer<typeof attemptSummarySchema>;
export type AttemptResult = z.infer<typeof attemptResultSchema>;
export type SubmitAttemptResponse = z.infer<typeof submitAttemptResponseSchema>;
export type AttemptsResponse = z.infer<typeof attemptsResponseSchema>;
export type AttemptSnapshotQuestion = z.infer<
  typeof attemptSnapshotQuestionSchema
>;
export type AttemptSnapshot = z.infer<typeof attemptSnapshotSchema>;
export type AttemptDetail = z.infer<typeof attemptDetailSchema>;
