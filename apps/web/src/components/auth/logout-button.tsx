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
}: {
  errorLabel: string;
  label: string;
  locale: Locale;
  pendingLabel: string;
}): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const logout = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    const result = await apiFetch<void>('/api/v1/auth/logout', {
      method: 'POST',
    });
    if (!result.ok) {
      setFailed(true);
      setPending(false);
      return;
    }
    router.replace(`/${locale}/login`);
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
