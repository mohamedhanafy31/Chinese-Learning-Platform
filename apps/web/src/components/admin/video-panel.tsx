'use client';

import { CircleAlert, Film, Info, Trash2, Upload, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';

import {
  uploadedVideoSchema,
  type AdminVideo,
  type Locale,
  type PendingVideo,
} from '@app/shared';

import {
  StatusLine,
  primaryButton,
  secondaryButton,
} from '@/components/admin/controls';
import { FormAlert } from '@/components/auth/form-controls';
import { adminErrorKey } from '@/lib/admin-errors';
import { failureKey } from '@/lib/admin-client';
import { apiFetch } from '@/lib/api-client';
import { startBunnyUpload } from '@/lib/bunny-upload';
import { usePendingVideo } from '@/lib/use-pending-video';
import {
  formatDuration,
  formatFileSize,
  formatPercent,
} from '@/lib/video-format';
import {
  readVideoDuration,
  startVideoUpload,
  type UploadOutcome,
  type VideoUpload,
} from '@/lib/video-upload';

type Phase = 'idle' | 'reading' | 'uploading' | 'finishing';

interface VideoPanelProps {
  lessonId: string;
  lessonTitle: string;
  video: AdminVideo | null;
  /** A newer upload still processing on Bunny, or one that failed. */
  pending: PendingVideo | null;
  /** Which provider takes new uploads; null when diagnostics are unavailable. */
  activeProvider: 'LOCAL' | 'BUNNY' | null;
  /**
   * API origin the browser posts uploads to ('' for same-origin `/api`). In
   * development this is the API itself, so the Next dev server never buffers a
   * large file.
   */
  uploadOrigin: string;
  /** False when Bunny Stream is not configured; null when unknown. */
  bunnyConfigured: boolean | null;
}

/** The lesson's video: details, preview, upload with progress, remove. */
export function VideoPanel({
  activeProvider,
  bunnyConfigured,
  lessonId,
  lessonTitle,
  pending: initialPending,
  uploadOrigin,
  video: initialVideo,
}: VideoPanelProps): React.JSX.Element {
  const t = useTranslations('Admin.video');
  const tErrors = useTranslations('Admin.errors');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const upload = useRef<VideoUpload | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [devOnly, setDevOnly] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const busy = phase !== 'idle';

  // While a Bunny upload is processing, re-read the lesson every five seconds.
  const { pending, video } = usePendingVideo({
    lessonId,
    video: initialVideo,
    pending: initialPending,
    onReady: () => router.refresh(),
  });
  const useBunny = activeProvider === 'BUNNY';

  // Leaving the page cancels an upload in flight (the API discards the partial
  // file), so a half-sent video never lingers.
  useEffect(
    () => () => {
      upload.current?.abort();
    },
    [],
  );

  function signIn(): void {
    router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
  }

  function describe(outcome: UploadOutcome): string | 'unauthenticated' | null {
    switch (outcome.kind) {
      case 'http-error':
        if (outcome.status === 401) return 'unauthenticated';
        if (outcome.status === 413) return t('errors.tooLarge');
        if (outcome.status === 415) return t('errors.type');
        if (outcome.status === 502) return t('errors.unavailable');
        return tErrors(adminErrorKey(outcome.status));
      case 'network-error':
        return t('errors.network');
      default:
        return null;
    }
  }

  async function onFile(
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setError(null);
    setStatus(null);
    setDevOnly(false);
    setProgress(0);
    setShowProgress(true);
    setPhase('reading');

    const durationSec = await readVideoDuration(file);
    setPhase('uploading');
    const started = useBunny
      ? startBunnyUpload({
          lessonId,
          file,
          durationSec,
          onProgress: setProgress,
          onSent: () => setPhase('finishing'),
        })
      : startVideoUpload({
          url: `${uploadOrigin}/api/v1/admin/lessons/${lessonId}/videos/local`,
          file,
          durationSec,
          onProgress: setProgress,
          onSent: () => setPhase('finishing'),
        });
    upload.current = started;
    const outcome = await started.promise;
    upload.current = null;
    setPhase('idle');

    if (outcome.kind === 'aborted') {
      setShowProgress(false);
      setStatus(t('cancelled'));
      return;
    }
    if (outcome.kind === 'success') {
      const parsed = uploadedVideoSchema.safeParse(outcome.data);
      setProgress(1);
      setDevOnly(!useBunny && parsed.success && parsed.data.devOnly);
      setStatus(useBunny ? t('bunny.uploadedProcessing') : t('done'));
      router.refresh();
      return;
    }
    setShowProgress(false);
    const message = describe(outcome);
    if (message === 'unauthenticated') return signIn();
    setError(message);
  }

  async function confirmRemove(): Promise<void> {
    if (removing) return;
    setRemoving(true);
    setDialogError(null);
    const result = await apiFetch<void>(
      `/api/v1/admin/lessons/${lessonId}/video`,
      { method: 'DELETE' },
    );
    setRemoving(false);
    if (!result.ok) {
      const key = await failureKey(result);
      if (key === 'unauthenticated') return signIn();
      setDialogError(tErrors(key));
      return;
    }
    dialogRef.current?.close();
    setShowProgress(false);
    setDevOnly(false);
    setStatus(t('removed'));
    router.refresh();
  }

  function failureText(reason: string | undefined): string {
    const known = [
      'encoding-failed',
      'upload-failed',
      'upload-abandoned',
      'video-missing',
    ];
    return t(
      `bunny.reasons.${reason && known.includes(reason) ? reason : 'unknown'}`,
    );
  }

  const percent = Math.round(progress * 100);
  const percentText = formatPercent(progress, locale);
  const progressLabelId = `${id}-progress`;

  return (
    <section
      aria-labelledby={`${id}-title`}
      data-testid="video-panel"
      className="rounded-2xl border-[1.5px] border-wash p-6"
    >
      <h2 id={`${id}-title`} className="text-xl font-semibold text-deep">
        {t('title')}
      </h2>
      <p className="mt-2 max-w-[34rem] text-cobalt">{t('intro')}</p>

      {bunnyConfigured === false ? (
        <p
          role="note"
          data-testid="video-dev-notice"
          className="mt-4 flex items-start gap-3 rounded-2xl bg-glaze-shade px-4 py-3 text-sm font-semibold leading-relaxed text-deep"
        >
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t('devNotice')}
        </p>
      ) : null}

      <div className="mt-6">
        {video ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            {video.status === 'READY' && video.provider === 'BUNNY' ? (
              <p
                data-testid="video-bunny-note"
                className="flex items-center gap-3 rounded-2xl bg-glaze-shade px-5 py-8 text-cobalt"
              >
                <Film aria-hidden="true" className="size-6 shrink-0" />
                {t('bunny.previewNote')}
              </p>
            ) : video.status === 'READY' ? (
              <div className="overflow-hidden rounded-2xl bg-deep">
                <video
                  key={video.id}
                  data-testid="video-preview"
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={t('previewLabel')}
                  src={`/api/v1/videos/${video.id}/stream`}
                  className="block aspect-video w-full bg-deep"
                />
              </div>
            ) : null}
            <dl
              data-testid="video-details"
              className="grid content-start gap-3 text-sm"
            >
              <div>
                <dt className="font-semibold text-deep">{t('fileName')}</dt>
                <dd className="break-words text-cobalt" dir="auto">
                  {video.originalName}
                </dd>
              </div>
              {video.sizeBytes === null ? null : (
                <div>
                  <dt className="font-semibold text-deep">{t('fileSize')}</dt>
                  <dd className="text-cobalt tabular">
                    {formatFileSize(video.sizeBytes, locale)}
                  </dd>
                </div>
              )}
              {video.durationSec === null ? null : (
                <div>
                  <dt className="font-semibold text-deep">{t('fileLength')}</dt>
                  <dd className="text-cobalt tabular">
                    {formatDuration(video.durationSec, locale)}
                  </dd>
                </div>
              )}
              <div>
                <dt className="font-semibold text-deep">{t('storage')}</dt>
                <dd className="text-cobalt">
                  {t(`provider.${video.provider}`)}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-deep">{t('fileStatus')}</dt>
                <dd className="text-cobalt">{t(`status.${video.status}`)}</dd>
              </div>
            </dl>
          </div>
        ) : pending ? null : (
          <p
            data-testid="video-empty"
            className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-unfired px-5 py-8 text-unfired-ink"
          >
            <Film aria-hidden="true" className="size-6 shrink-0" />
            {t('none')}
          </p>
        )}
      </div>

      {pending ? (
        <div
          data-testid="video-pending"
          data-status={pending.status}
          className="mt-4 rounded-2xl bg-glaze-shade px-5 py-4"
        >
          {pending.status === 'FAILED' ? (
            <p
              role="alert"
              data-testid="video-pending-failed"
              className="flex items-start gap-3 font-semibold leading-relaxed text-deep"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
              />
              {t('bunny.failed', {
                reason: failureText(pending.failureReason),
              })}
            </p>
          ) : (
            <div role="status">
              <p className="font-semibold text-deep">
                {pending.status === 'PROCESSING'
                  ? t('bunny.processing')
                  : t('bunny.pendingUploading')}
              </p>
              {pending.status === 'PROCESSING' ? (
                <>
                  <div
                    aria-hidden="true"
                    className="mt-3 h-2.5 overflow-hidden rounded-full bg-wash"
                  >
                    <div className="h-full w-2/5 rounded-full bg-cobalt motion-safe:animate-pulse" />
                  </div>
                  <p className="mt-3 text-sm text-cobalt">
                    {t('bunny.processingHelp')}
                  </p>
                </>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          ref={inputRef}
          id={`${id}-file`}
          type="file"
          accept="video/mp4,video/webm"
          disabled={busy}
          onChange={(event) => void onFile(event)}
          aria-label={t('fileLabel')}
          aria-describedby={`${id}-helper`}
          className="sr-only"
        />
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => inputRef.current?.click()}
          className={`${primaryButton} gap-2`}
        >
          <Upload aria-hidden="true" className="size-5" />
          {phase === 'idle'
            ? video || pending
              ? t('replace')
              : t('choose')
            : t('uploading')}
        </button>
        {phase === 'uploading' || phase === 'finishing' ? (
          <button
            type="button"
            onClick={() => upload.current?.abort()}
            className={`${secondaryButton} gap-2`}
          >
            <X aria-hidden="true" className="size-5" />
            {t('cancel')}
          </button>
        ) : null}
        {(video || pending) && !busy ? (
          <button
            type="button"
            onClick={() => {
              setDialogError(null);
              dialogRef.current?.showModal();
            }}
            className={`${secondaryButton} gap-2`}
          >
            <Trash2 aria-hidden="true" className="size-5" />
            {t('remove')}
          </button>
        ) : null}
      </div>
      <p id={`${id}-helper`} className="mt-2 text-sm text-cobalt">
        {t('helper')}
      </p>

      {showProgress ? (
        <div className="mt-5">
          <div className="flex items-center justify-between gap-4 text-sm text-cobalt">
            <span id={progressLabelId}>
              {phase === 'finishing' ? t('finishing') : t('progressLabel')}
            </span>
            <span
              data-testid="video-percent"
              className="font-semibold tabular text-deep"
            >
              {percentText}
            </span>
          </div>
          <div
            role="progressbar"
            aria-labelledby={progressLabelId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={percentText}
            className="mt-2 h-2.5 overflow-hidden rounded-full bg-glaze-shade"
          >
            <div
              className="h-full rounded-full bg-cobalt transition-[width] duration-150"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <FormAlert>{error}</FormAlert>
        </div>
      ) : null}
      {devOnly ? (
        <p role="note" className="mt-4 text-sm font-semibold text-deep">
          {t('devOnlyUploaded')}
        </p>
      ) : null}
      <div className="mt-2">
        <StatusLine message={status} />
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-remove-title`}
        aria-describedby={`${id}-remove-body`}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-white p-6 text-deep backdrop:bg-deep/60 sm:p-8"
        onClose={() => setDialogError(null)}
      >
        <h2
          id={`${id}-remove-title`}
          className="font-display text-3xl leading-tight"
        >
          {t('removeTitle')}
        </h2>
        <p id={`${id}-remove-body`} className="mt-4 leading-[1.8] text-cobalt">
          {t('removeBody', { title: lessonTitle })}
        </p>
        {dialogError ? (
          <div className="mt-4">
            <FormAlert>{dialogError}</FormAlert>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <button
            type="button"
            disabled={removing}
            onClick={() => dialogRef.current?.close()}
            className={secondaryButton}
          >
            {t('keep')}
          </button>
          <button
            type="button"
            disabled={removing}
            aria-busy={removing}
            onClick={() => void confirmRemove()}
            className={primaryButton}
          >
            {removing ? t('removing') : t('confirmRemove')}
          </button>
        </div>
      </dialog>
    </section>
  );
}
