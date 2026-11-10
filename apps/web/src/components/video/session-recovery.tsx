'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { apiFetch } from '@/lib/api-client';

/**
 * A lesson page is public, so an expired access cookie looks like a signed-out
 * visitor. This tries the refresh cookie once; when it works the server page
 * re-renders with the learner's real access. Silent when it does not.
 */
export function SessionRecovery(): null {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void apiFetch<unknown>('/api/v1/auth/refresh', { method: 'POST' }).then(
      (result) => {
        if (result.ok) router.refresh();
      },
    );
  }, [router]);

  return null;
}
