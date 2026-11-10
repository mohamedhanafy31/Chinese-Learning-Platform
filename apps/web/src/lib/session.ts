import 'server-only';

import { cache } from 'react';

import { publicUserSchema, type PublicUser } from '@app/shared';

import { apiServerFetch } from '@/lib/api-server';

export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
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
});
