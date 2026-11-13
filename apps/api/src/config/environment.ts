import { DEFAULT_VIDEO_MAX_BYTES } from '@app/shared';
import { z } from 'zod';

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

function optionalOf(schema: z.ZodType<string>): z.ZodType<string | undefined> {
  return z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  ) as z.ZodType<string | undefined>;
}

function withDefault<Output extends string | number>(
  schema: z.ZodType<Output>,
  fallback: Output,
): z.ZodType<Output> {
  return z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    schema.default(fallback),
  ) as z.ZodType<Output>;
}

/** Placeholder secrets shipped in .env.example; never acceptable in production. */
const PLACEHOLDER_SECRET_PREFIXES = ['replace-with', 'changeme', 'change-me'];

/** Bunny and Paymob are optional, but a half-filled group is a deployment bug. */
const BUNNY_KEYS = [
  'BUNNY_LIBRARY_ID',
  'BUNNY_API_KEY',
  'BUNNY_TOKEN_KEY',
  'BUNNY_WEBHOOK_SECRET',
  'BUNNY_CDN_HOST',
] as const;
const PAYMOB_KEYS = [
  'PAYMOB_SECRET_KEY',
  'PAYMOB_PUBLIC_KEY',
  'PAYMOB_HMAC_SECRET',
  'PAYMOB_INTEGRATION_IDS',
] as const;

const baseSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  DATABASE_URL: z.url(),
  APP_URL: z.url(),
  INTERNAL_API_URL: z.url(),
  API_PUBLIC_ORIGIN: optionalOf(z.url()),
  UPLOADS_DIR: optionalString,
  VIDEO_MAX_BYTES: z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    z.coerce
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .default(DEFAULT_VIDEO_MAX_BYTES),
  ),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  BUNNY_LIBRARY_ID: optionalOf(
    z.string().regex(/^\d+$/, 'BUNNY_LIBRARY_ID must be a numeric library id'),
  ),
  BUNNY_API_KEY: optionalString,
  BUNNY_TOKEN_KEY: optionalString,
  BUNNY_WEBHOOK_SECRET: optionalString,
  BUNNY_CDN_HOST: optionalOf(
    z
      .string()
      .regex(
        /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i,
        'BUNNY_CDN_HOST must be a bare hostname without a scheme or path',
      ),
  ),
  /** Overridable so tests can point the client at a mock Bunny server. */
  BUNNY_API_BASE: withDefault(z.url(), 'https://video.bunnycdn.com'),
  BUNNY_EMBED_BASE: withDefault(z.url(), 'https://iframe.mediadelivery.net'),
  BUNNY_EMBED_TTL_SEC: withDefault(
    z.coerce.number().int().min(60).max(86_400),
    900,
  ),
  /** Seconds between reconcile runs; 0 disables the interval. */
  VIDEO_RECONCILE_INTERVAL_SEC: withDefault(
    z.coerce.number().int().min(0).max(86_400),
    300,
  ),
  VIDEO_ORPHAN_SWEEP_INTERVAL_SEC: withDefault(
    z.coerce.number().int().min(0).max(86_400),
    3600,
  ),
  PAYMOB_SECRET_KEY: optionalString,
  PAYMOB_PUBLIC_KEY: optionalString,
  PAYMOB_HMAC_SECRET: optionalString,
  PAYMOB_INTEGRATION_IDS: optionalOf(
    z
      .string()
      .regex(
        /^\s*[1-9]\d*\s*(?:,\s*[1-9]\d*\s*)*$/,
        'PAYMOB_INTEGRATION_IDS must be comma-separated positive integers',
      ),
  ),
  PAYMOB_API_BASE: withDefault(z.url(), 'https://accept.paymob.com'),
  PAYMOB_CHECKOUT_BASE: withDefault(
    z.url(),
    'https://accept.paymob.com/unifiedcheckout/',
  ),
  ORDER_TTL_MIN: withDefault(
    z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    60,
  ),
  /** Seconds between expiry runs; 0 disables the interval. */
  BILLING_EXPIRY_INTERVAL_SEC: withDefault(
    z.coerce.number().int().min(0).max(86_400),
    300,
  ),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    z.coerce.number().int().positive().max(65_535).optional(),
  ),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_FROM: optionalString,
});

type ProductionInput = Pick<
  z.infer<typeof baseSchema>,
  | 'APP_URL'
  | 'API_PUBLIC_ORIGIN'
  | 'JWT_ACCESS_SECRET'
  | 'JWT_REFRESH_SECRET'
  | (typeof BUNNY_KEYS)[number]
  | (typeof PAYMOB_KEYS)[number]
>;

/** Extra production-only rules. Messages name variables, never their values. */
function validateProduction(
  environment: ProductionInput,
  context: z.RefinementCtx,
): void {
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const value = environment[key].toLowerCase();
    if (
      PLACEHOLDER_SECRET_PREFIXES.some((prefix) => value.startsWith(prefix))
    ) {
      context.addIssue({
        code: 'custom',
        message: `${key} still holds a placeholder value`,
        path: [key],
      });
    }
  }

  if (environment.JWT_ACCESS_SECRET === environment.JWT_REFRESH_SECRET) {
    context.addIssue({
      code: 'custom',
      message: 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET',
      path: ['JWT_REFRESH_SECRET'],
    });
  }

  if (new URL(environment.APP_URL).protocol !== 'https:') {
    context.addIssue({
      code: 'custom',
      message: 'APP_URL must use https in production (cookies are Secure)',
      path: ['APP_URL'],
    });
  }

  if (
    environment.API_PUBLIC_ORIGIN !== undefined &&
    new URL(environment.API_PUBLIC_ORIGIN).protocol !== 'https:'
  ) {
    context.addIssue({
      code: 'custom',
      message:
        'API_PUBLIC_ORIGIN must use https in production (leave it empty to reuse APP_URL)',
      path: ['API_PUBLIC_ORIGIN'],
    });
  }

  for (const [group, keys] of [
    ['Bunny', BUNNY_KEYS],
    ['Paymob', PAYMOB_KEYS],
  ] as const) {
    const missing = keys.filter((key) => environment[key] === undefined);
    if (missing.length > 0 && missing.length < keys.length) {
      context.addIssue({
        code: 'custom',
        message: `${group} is partially configured; also set ${missing.join(', ')} (or clear them all)`,
        path: [missing[0] as string],
      });
    }
  }
}

export const environmentSchema = baseSchema.superRefine(
  (environment, context) => {
    if (environment.NODE_ENV === 'production' && !environment.UPLOADS_DIR) {
      context.addIssue({
        code: 'custom',
        path: ['UPLOADS_DIR'],
        message: 'UPLOADS_DIR must be explicitly set in production',
      });
    }
    if (environment.NODE_ENV === 'production') {
      validateProduction(environment, context);
    }

    const smtpValues = [
      environment.SMTP_HOST,
      environment.SMTP_PORT,
      environment.SMTP_USER,
      environment.SMTP_PASSWORD,
      environment.SMTP_FROM,
    ];
    const configuredCount = smtpValues.filter(
      (value) => value !== undefined,
    ).length;

    if (configuredCount > 0 && configuredCount < smtpValues.length) {
      context.addIssue({
        code: 'custom',
        message: 'All SMTP_* values must be set together',
        path: ['SMTP_HOST'],
      });
    }
  },
);

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  values: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(values);

  if (!result.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(result.error)}`);
  }

  return result.data;
}
