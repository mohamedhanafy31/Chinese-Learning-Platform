'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { FormAlert } from '@/components/auth/form-controls';
import {
  StatusLine,
  primaryButton,
  secondaryButton,
} from '@/components/admin/controls';
import { catalogStatus, StatusBadge } from '@/components/admin/status-badge';
import { failureKey } from '@/lib/admin-client';
import { apiFetch } from '@/lib/api-client';

type Verb = 'publish' | 'unpublish' | 'archive' | 'unarchive';

interface LifecycleActionsProps {
  kind: 'level' | 'lesson';
  id: string;
  title: string;
  locale: string;
  isPublished: boolean;
  archivedAt: string | null;
  firstPublishedAt: string | null;
  /** Where to go after a successful delete. */
  afterDeleteHref: string;
}

const doneKey = {
  publish: 'donePublish',
  unpublish: 'doneUnpublish',
  archive: 'doneArchive',
  unarchive: 'doneUnarchive',
} as const;

/** Publish, archive and delete for one level or lesson. */
export function LifecycleActions({
  afterDeleteHref,
  archivedAt,
  firstPublishedAt,
  id,
  isPublished,
  kind,
  locale,
  title,
}: LifecycleActionsProps): React.JSX.Element {
  const t = useTranslations('Admin.lifecycle');
  const tStatus = useTranslations('Admin.status');
  const tErrors = useTranslations('Admin.errors');
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<Verb | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const status_ = catalogStatus({ isPublished, archivedAt });
  const base = `/api/v1/admin/${kind === 'level' ? 'levels' : 'lessons'}/${id}`;
  const hint =
    status_ === 'published'
      ? t('publishedHint')
      : status_ === 'archived'
        ? t('archivedHint')
        : t('draftHint');

  function signIn(): void {
    router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
  }

  async function run(verb: Verb): Promise<void> {
    if (pending) return;
    setPending(verb);
    setError(null);
    setStatus(null);
    const result = await apiFetch<unknown>(`${base}/${verb}`, {
      method: 'POST',
    });
    setPending(null);
    if (!result.ok) {
      const key = await failureKey(result);
      if (key === 'unauthenticated') return signIn();
      setError(tErrors(key));
      return;
    }
    setStatus(t(doneKey[verb]));
    router.refresh();
  }

  async function confirmDelete(): Promise<void> {
    if (pending) return;
    setPending('delete');
    setDialogError(null);
    const result = await apiFetch<void>(base, { method: 'DELETE' });
    if (!result.ok) {
      setPending(null);
      const key = await failureKey(result);
      if (key === 'unauthenticated') return signIn();
      setDialogError(tErrors(key));
      return;
    }
    dialogRef.current?.close();
    router.push(afterDeleteHref);
    router.refresh();
  }

  const busy = pending !== null;
  const canDelete = firstPublishedAt === null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={status_} label={tStatus(status_)} />
        <p className="text-sm text-cobalt">{hint}</p>
      </div>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {archivedAt === null ? (
          isPublished ? (
            <button
              type="button"
              disabled={busy}
              aria-busy={pending === 'unpublish'}
              onClick={() => void run('unpublish')}
              className={primaryButton}
            >
              {pending === 'unpublish' ? t('working') : t('unpublish')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              aria-busy={pending === 'publish'}
              onClick={() => void run('publish')}
              className={primaryButton}
            >
              {pending === 'publish' ? t('working') : t('publish')}
            </button>
          )
        ) : null}

        {archivedAt === null ? (
          <button
            type="button"
            disabled={busy}
            aria-busy={pending === 'archive'}
            onClick={() => void run('archive')}
            className={secondaryButton}
          >
            {pending === 'archive' ? t('working') : t('archive')}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            aria-busy={pending === 'unarchive'}
            onClick={() => void run('unarchive')}
            className={primaryButton}
          >
            {pending === 'unarchive' ? t('working') : t('unarchive')}
          </button>
        )}

        {canDelete ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDialogError(null);
              dialogRef.current?.showModal();
            }}
            className={secondaryButton}
          >
            {t('delete')}
          </button>
        ) : null}
      </div>
      {canDelete ? null : (
        <p className="text-sm text-cobalt">{t('deleteHint')}</p>
      )}
      <StatusLine message={status} />

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-delete-title`}
        aria-describedby={`${id}-delete-body`}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-glaze-bright p-6 text-deep backdrop:bg-deep/60 sm:p-8"
        onClose={() => setDialogError(null)}
      >
        <h2
          id={`${id}-delete-title`}
          className="font-display text-3xl leading-tight"
        >
          {kind === 'level'
            ? t('deleteTitleLevel')
            : t('deleteTitleLesson')}
        </h2>
        <p id={`${id}-delete-body`} className="mt-4 leading-[1.8] text-cobalt">
          {kind === 'level'
            ? t('deleteBodyLevel', { title })
            : t('deleteBodyLesson', { title })}
        </p>
        {dialogError ? (
          <div className="mt-4">
            <FormAlert>{dialogError}</FormAlert>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <button
            type="button"
            disabled={pending === 'delete'}
            onClick={() => dialogRef.current?.close()}
            className={secondaryButton}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={pending === 'delete'}
            aria-busy={pending === 'delete'}
            onClick={() => void confirmDelete()}
            className={primaryButton}
          >
            {pending === 'delete' ? t('deleting') : t('confirmDelete')}
          </button>
        </div>
      </dialog>
    </div>
  );
}
