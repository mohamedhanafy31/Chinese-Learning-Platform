import 'server-only';

import { headers } from 'next/headers';

/**
 * The visitor's address as seen by Caddy: the last entry Caddy appended to
 * X-Forwarded-For. Earlier entries are client-supplied and untrusted.
 */
export function clientAddress(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null;
  const last = forwardedFor.split(',').at(-1)?.trim();
  return last && /^[0-9a-fA-F:.]{2,45}$/.test(last) ? last : null;
}

export async function apiServerFetch(
  path: string,
  init: Omit<RequestInit, 'cache'> = {},
): Promise<Response> {
  const incomingHeaders = await headers();
  const cookie = incomingHeaders.get('cookie');
  const requestHeaders = new Headers(init.headers);

  if (cookie) {
    requestHeaders.set('cookie', cookie);
  }

  // Server-side calls reach the API from the web container's address. Pass
  // the visitor's address on so the API's per-IP throttling (trust proxy = 1
  // hop) buckets each visitor separately instead of all visitors together.
  const address = clientAddress(incomingHeaders.get('x-forwarded-for'));
  if (address) {
    requestHeaders.set('x-forwarded-for', address);
  }

  const baseUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

  return fetch(new URL(path, `${baseUrl.replace(/\/$/, '')}/`), {
    ...init,
    cache: 'no-store',
    headers: requestHeaders,
  });
}
