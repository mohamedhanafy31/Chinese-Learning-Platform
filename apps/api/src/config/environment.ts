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

export const environmentSchema = z
  .object({
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
      z
        .string()
        .regex(/^\d+$/, 'BUNNY_LIBRARY_ID must be a numeric library id'),
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
      7200,
    ),
    /** Seconds between reconcile runs; 0 disables the interval. */
    VIDEO_RECONCILE_INTERVAL_SEC: withDefault(
      z.coerce.number().int().min(0).max(86_400),
      300,
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
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production') {
      for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        if (environment[key].startsWith('replace-with')) {
          context.addIssue({
            code: 'custom',
            message: `${key} still holds the .env.example placeholder`,
            path: [key],
          });
        }
      }
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
  });

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
