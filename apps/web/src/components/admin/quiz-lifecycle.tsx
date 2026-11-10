'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import type { Locale } from '@app/shared';

import { FormAlert } from '@/components/auth/form-controls';
import {
  StatusLine,
  primaryButton,
  secondaryButton,
} from '@/components/admin/controls';
import { catalogStatus, StatusBadge } from '@/components/admin/status-badge';
import { useQuizErrorText } from '@/components/admin/use-quiz-error';
import { apiFetch } from '@/lib/api-client';
import { quizFailureKey } from '@/lib/quiz-errors';

type Busy = 'archive' | 'restore' | 'delete' | null;

/** Archive or restore a quiz, and delete it (only while it has no attempts). */
export function QuizLifecycle({
  archivedAt,
  id,
  lessonId,
  locale,
  title,
}: {
  id: string;
  lessonId: string;
  locale: Locale;
  title: string;
  archivedAt: string | null;
}): React.JSX.Element {
  const t = useTranslations('Admin.quiz');
  const tLife = useTranslations('Admin.lifecycle');
  const tStatus = useTranslations('Admin.status');
  const errorText = useQuizErrorText();
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [hasAttempts, setHasAttempts] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const archived = archivedAt !== null;
  const signIn = (): void =>
    router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}`);

  async function run(verb: 'archive' | 'restore'): Promise<void> {
    if (busy) return;
    setBusy(verb);
    setError(null);
    setStatus(null);
    const result = await apiFetch<unknown>(
      `/api/v1/admin/quizzes/${id}/${verb}`,
      {
        method: 'POST',
      },
    );
    setBusy(null);
    if (!result.ok) {
      const key = await quizFailureKey(result);
      if (key === 'unauthenticated') return signIn();
      setError(errorText(key));
      return;
    }
    dialogRef.current?.close();
    setStatus(verb === 'archive' ? t('doneArchive') : t('doneRestore'));
    router.refresh();
  }

  async function confirmDelete(): Promise<void> {
    if (busy) return;
    setBusy('delete');
    setDialogError(null);
    const result = await apiFetch<void>(`/api/v1/admin/quizzes/${id}`, {
      method: 'DELETE',
    });
    if (!result.ok) {
      setBusy(null);
      const key = await quizFailureKey(result);
      if (key === 'unauthenticated') return signIn();
      setHasAttempts(key === 'hasAttempts');
      setDialogError(errorText(key));
      return;
    }
    dialogRef.current?.close();
    router.push(`/${locale}/admin/lessons/${lessonId}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge
          status={catalogStatus({ isPublished: true, archivedAt })}
          label={archived ? tStatus('archived') : t('live')}
        />
        <p className="text-sm text-cobalt">
          {archived ? t('archivedHint') : t('liveHint')}
        </p>
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {archived ? (
          <button
            type="button"
            disabled={busy !== null}
            aria-busy={busy === 'restore'}
            onClick={() => void run('restore')}
            className={primaryButton}
          >
            {busy === 'restore' ? tLife('working') : t('restore')}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy !== null}
            aria-busy={busy === 'archive'}
            onClick={() => void run('archive')}
            className={secondaryButton}
          >
            {busy === 'archive' ? tLife('working') : tLife('archive')}
          </button>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setDialogError(null);
            setHasAttempts(false);
            dialogRef.current?.showModal();
          }}
          className={secondaryButton}
        >
          {tLife('delete')}
        </button>
      </div>
      <StatusLine message={status} />

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-delete-title`}
        aria-describedby={`${id}-delete-body`}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-glaze-bright p-6 text-deep backdrop:bg-deep/60 sm:p-8"
      >
        <h2
          id={`${id}-delete-title`}
          className="font-display text-3xl leading-tight"
        >
          {t('deleteTitle')}
        </h2>
        <p id={`${id}-delete-body`} className="mt-4 leading-[1.8] text-cobalt">
          {t('deleteBody', { title })}
        </p>
        {dialogError ? (
          <div className="mt-4">
            <FormAlert>{dialogError}</FormAlert>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <button
            type="button"
            disabled={busy === 'delete'}
            onClick={() => dialogRef.current?.close()}
            className={secondaryButton}
          >
            {tLife('cancel')}
          </button>
          {hasAttempts && !archived ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void run('archive')}
              className={primaryButton}
            >
              {t('archiveInstead')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy === 'delete'}
              aria-busy={busy === 'delete'}
              onClick={() => void confirmDelete()}
              className={primaryButton}
            >
              {busy === 'delete' ? tLife('deleting') : tLife('confirmDelete')}
            </button>
          )}
        </div>
      </dialog>
    </div>
  );
}
