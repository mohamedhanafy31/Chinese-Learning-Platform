'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { userResponseSchema, type Locale } from '@app/shared';

import { apiFetch } from '@/lib/api-client';
import { roleHome } from '@/lib/role-home';
import { localeFallback, safeNext } from '@/lib/safe-next';

export function SessionRenewal({
  locale,
  next,
}: {
  locale: Locale;
  next?: string;
}): null {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void apiFetch<unknown>('/api/v1/auth/refresh', { method: 'POST' }).then(
      (result) => {
        if (result.ok) {
          const parsed = userResponseSchema.safeParse(result.data);
          if (parsed.success) {
            router.replace(
              safeNext(next, roleHome(locale, parsed.data.user.role)),
            );
            router.refresh();
            return;
          }
        }

        const loginNext = safeNext(next, localeFallback(locale));
        router.replace(
          `/${locale}/login?${new URLSearchParams({ next: loginNext })}`,
        );
      },
    );
  }, [locale, next, router]);

  return null;
}
