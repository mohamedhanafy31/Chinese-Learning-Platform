const DEVELOPMENT_FALLBACK = 'http://localhost:4000';

/**
 * Where the web server reaches the API (the Compose service address in
 * production). Production refuses to guess: a missing value would silently
 * point server-side fetches at the web container itself.
 */
export function internalApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.INTERNAL_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  // `next build` evaluates modules without runtime configuration.
  const building = env.NEXT_PHASE === 'phase-production-build';
  if (env.NODE_ENV === 'production' && !building) {
    throw new Error('INTERNAL_API_URL is required in production');
  }
  return DEVELOPMENT_FALLBACK;
}
