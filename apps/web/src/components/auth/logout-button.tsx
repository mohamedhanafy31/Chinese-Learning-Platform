'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { Locale } from '@app/shared';

import { apiFetch } from '@/lib/api-client';
import { FormAlert } from '@/components/auth/form-controls';

export function LogoutButton({
  errorLabel,
  label,
  locale,
  pendingLabel,
  portal = 'student',
}: {
  errorLabel: string;
  label: string;
  locale: Locale;
  pendingLabel: string;
  portal?: 'admin' | 'student';
}): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const logout = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    // Revoke server-side first: the browser sends the path-scoped refresh
    // cookie only to the API, even when the access token has expired. Then
    // expire both cookies locally so logout also works if the API is down.
    const revoked = await apiFetch<void>('/api/v1/auth/logout', {
      method: 'POST',
      signal: AbortSignal.timeout(2_500),
    });
    const cleared = await apiFetch<void>('/api/auth/logout', {
      method: 'POST',
    });
    if (!revoked.ok && !cleared.ok) {
      setFailed(true);
      setPending(false);
      return;
    }
    router.replace(
      portal === 'admin' ? `/${locale}/admin/login` : `/${locale}/login`,
    );
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {failed ? <FormAlert>{errorLabel}</FormAlert> : null}
      <button
        type="button"
        onClick={() => void logout()}
        disabled={pending}
        aria-busy={pending}
        className="inline-flex min-h-14 items-center justify-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt disabled:cursor-not-allowed disabled:bg-wash disabled:text-cobalt"
      >
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}
