import 'server-only';

/**
 * Where the browser posts a local video upload. Returns '' (same origin, the
 * `/api` path through Caddy) in production. In development, and in the e2e
 * run (which starts Next in production mode, flagged `E2E_NEXT_START`), it is
 * the API's public origin: the Next rewrite buffers request bodies, so a large
 * file must go straight to the API, which allows CORS from APP_URL for that
 * one route. See `enableDevVideoUploadCors` in the API.
 */
export function videoUploadOrigin(): string {
  const direct =
    process.env.NODE_ENV !== 'production' || process.env.E2E_NEXT_START === '1';
  if (!direct) return '';
  return (process.env.API_PUBLIC_ORIGIN ?? 'http://localhost:4000').replace(
    /\/$/,
    '',
  );
}
