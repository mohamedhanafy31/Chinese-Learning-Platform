import { z } from 'zod';

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

export const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  DATABASE_URL: z.url(),
  APP_URL: z.url(),
  INTERNAL_API_URL: z.url(),
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
