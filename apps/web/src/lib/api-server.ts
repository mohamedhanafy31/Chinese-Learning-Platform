import 'server-only';

import { headers } from 'next/headers';

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

  const baseUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

  return fetch(new URL(path, `${baseUrl.replace(/\/$/, '')}/`), {
    ...init,
    cache: 'no-store',
    headers: requestHeaders,
  });
}
