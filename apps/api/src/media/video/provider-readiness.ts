import type { ProviderReadiness } from '@app/shared';

/** Every one of these must be set before Bunny Stream can be used. */
export const BUNNY_ENV_KEYS = [
  'BUNNY_LIBRARY_ID',
  'BUNNY_API_KEY',
  'BUNNY_TOKEN_KEY',
  'BUNNY_WEBHOOK_SECRET',
  'BUNNY_CDN_HOST',
] as const;

export type BunnyEnvKey = (typeof BUNNY_ENV_KEYS)[number];

/**
 * Which video provider handles new uploads: BUNNY only when all five variables
 * are set, otherwise LOCAL. Only variable names are reported, never values.
 */
export function computeProviderReadiness(
  values: Partial<Record<BunnyEnvKey, string | undefined>>,
): ProviderReadiness {
  const missing = BUNNY_ENV_KEYS.filter((key) => !values[key]);
  return {
    bunny: { configured: missing.length === 0, missing },
    active: missing.length === 0 ? 'BUNNY' : 'LOCAL',
  };
}

/** Partially configured Bunny is almost certainly a mistake worth a warning. */
export function isPartiallyConfigured(readiness: ProviderReadiness): boolean {
  const { configured, missing } = readiness.bunny;
  return !configured && missing.length < BUNNY_ENV_KEYS.length;
}
