import { DEFAULT_VIDEO_MAX_BYTES } from '@app/shared';
import { z } from 'zod';

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

export const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().max(65_535).default(4000),
    DATABASE_URL: z.url(),
    APP_URL: z.url(),
    INTERNAL_API_URL: z.url(),
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
    BUNNY_LIBRARY_ID: optionalString,
    BUNNY_API_KEY: optionalString,
    BUNNY_TOKEN_KEY: optionalString,
    BUNNY_WEBHOOK_SECRET: optionalString,
    BUNNY_CDN_HOST: optionalString,
    PAYMOB_SECRET_KEY: optionalString,
    PAYMOB_PUBLIC_KEY: optionalString,
    PAYMOB_HMAC_SECRET: optionalString,
    PAYMOB_INTEGRATION_IDS: optionalString,
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
