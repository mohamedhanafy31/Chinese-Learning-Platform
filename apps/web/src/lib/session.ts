import 'server-only';

import { cache } from 'react';

import { publicUserSchema, type PublicUser } from '@app/shared';

import { apiServerFetch } from '@/lib/api-server';

async function fetchCurrentUser(): Promise<PublicUser | null> {
  const response = await apiServerFetch('/api/v1/auth/me');

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Session lookup failed with status ${response.status}`);
  }

  const payload: unknown = await response.json();
  return publicUserSchema.parse(
    typeof payload === 'object' && payload !== null && 'user' in payload
      ? payload.user
      : payload,
  );
}

export const getCurrentUser = cache(fetchCurrentUser);

/**
 * Public auth pages should remain usable when the API is restarting or
 * temporarily unavailable. Protected pages continue to use the strict lookup
 * above so an outage can never be mistaken for authorization.
 */
export const getCurrentUserIfAvailable = cache(
  async (): Promise<PublicUser | null> => {
    try {
      return await fetchCurrentUser();
    } catch {
      return null;
    }
  },
);
