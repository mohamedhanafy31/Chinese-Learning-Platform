'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';

import { FormAlert } from '@/components/auth/form-controls';
import { primaryButton, secondaryButton } from '@/components/admin/controls';
import { failureKey } from '@/lib/admin-client';
import { apiFetch, jsonRequest } from '@/lib/api-client';

/**
 * Deactivates or reactivates a student. Deactivating signs the student out on
 * every device, so it is confirmed in a native dialog that says so.
 */
export function StudentStatusButton({
  isActive,
  locale,
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
  isActive: boolean;
  locale: string;
}): React.JSX.Element {
  const t = useTranslations('Admin.student');
  const tErrors = useTranslations('Admin.errors');
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await apiFetch<unknown>(
      `/api/v1/admin/students/${studentId}/${isActive ? 'deactivate' : 'reactivate'}`,
      jsonRequest({}, { method: 'POST' }),
    );
    setPending(false);
    if (!result.ok) {
      const key = await failureKey(result);
      if (key === 'unauthenticated') {
        router.replace(
          `/${locale}/admin/login?next=${encodeURIComponent(pathname)}`,
        );
        return;
      }
      setError(tErrors(key));
      return;
    }
    dialogRef.current?.close();
    router.refresh();
  }

  const prefix = isActive ? 'deactivate' : 'reactivate';

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          dialogRef.current?.showModal();
        }}
        className={isActive ? secondaryButton : primaryButton}
      >
        {t(`${prefix}Action`)}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-glaze-bright p-6 text-deep backdrop:bg-deep/60 sm:p-8"
        onClose={() => setError(null)}
      >
        <h2 id={`${id}-title`} className="font-display text-3xl leading-tight">
          {t(`${prefix}Title`)}
        </h2>
        <p id={`${id}-body`} className="mt-4 leading-[1.8] text-cobalt">
          {t(`${prefix}Body`, { name: studentName })}
        </p>
        {error ? (
          <div className="mt-4">
            <FormAlert>{error}</FormAlert>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => dialogRef.current?.close()}
            className={secondaryButton}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={pending}
            aria-busy={pending}
            onClick={() => void confirm()}
            className={primaryButton}
          >
            {pending ? t(`${prefix}Pending`) : t(`${prefix}Confirm`)}
          </button>
        </div>
      </dialog>
    </>
  );
}
