'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { userResponseSchema, type Locale } from '@app/shared';

import { apiFetchParsed } from '@/lib/api-client';
import { roleHome } from '@/lib/role-home';
import { loginPathForNext, safeNext } from '@/lib/safe-next';

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

    void apiFetchParsed('/api/v1/auth/refresh', userResponseSchema, {
      method: 'POST',
    }).then((result) => {
      if (result.ok) {
        router.replace(safeNext(next, roleHome(locale, result.data.user.role)));
        router.refresh();
        return;
      }

        router.replace(loginPathForNext(locale, next));
      },
    );
  }, [locale, next, router]);

  return null;
}
