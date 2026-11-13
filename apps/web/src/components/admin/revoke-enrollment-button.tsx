'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';

import { MAX_REVOKE_REASON_LENGTH } from '@app/shared';

import { FormAlert } from '@/components/auth/form-controls';
import {
  TextAreaField,
  primaryButton,
  secondaryButton,
} from '@/components/admin/controls';
import { failureKey } from '@/lib/admin-client';
import { apiFetch, jsonRequest } from '@/lib/api-client';

/** Revoke one active enrollment, with an optional reason, in a native dialog. */
export function RevokeEnrollmentButton({
  levelId,
  levelTitle,
  locale,
  studentId,
}: {
  studentId: string;
  levelId: string;
  levelTitle: string;
  locale: string;
}): React.JSX.Element {
  const t = useTranslations('Admin.student');
  const tErrors = useTranslations('Admin.errors');
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | undefined>();

  function open(): void {
    setError(null);
    setReasonError(undefined);
    dialogRef.current?.showModal();
  }

  async function confirm(): Promise<void> {
    if (pending) return;
    setError(null);
    const trimmed = reason.trim();
    if (Array.from(trimmed).length > MAX_REVOKE_REASON_LENGTH) {
      setReasonError(t('reasonTooLong'));
      return;
    }
    setReasonError(undefined);
    setPending(true);
    const result = await apiFetch<void>(
      `/api/v1/admin/students/${studentId}/enrollments/${levelId}`,
      jsonRequest(trimmed ? { reason: trimmed } : {}, { method: 'DELETE' }),
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
    setReason('');
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={t('revokeLabel', { title: levelTitle })}
        className={secondaryButton}
      >
        {t('revoke')}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-glaze-bright p-6 text-deep backdrop:bg-deep/60 sm:p-8"
        onClose={() => setError(null)}
      >
        <h2 id={`${id}-title`} className="font-display text-3xl leading-tight">
          {t('revokeTitle')}
        </h2>
        <p id={`${id}-body`} className="mt-4 leading-[1.8] text-cobalt">
          {t('revokeBody', { title: levelTitle })}
        </p>
        <div className="mt-5">
          <TextAreaField
            id={`${id}-reason`}
            label={t('reasonField')}
            helper={t('reasonHelper')}
            error={reasonError}
            value={reason}
            onChange={setReason}
          />
        </div>
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
            {pending ? t('revoking') : t('confirmRevoke')}
          </button>
        </div>
      </dialog>
    </>
  );
}
