import * as tus from 'tus-js-client';

import { bunnyUploadTicketSchema, type BunnyUploadTicket } from '@app/shared';

import { apiFetch, jsonRequest } from '@/lib/api-client';
import type { UploadOutcome, VideoUpload } from '@/lib/video-upload';

/** 50 MB per PATCH keeps retries cheap on a flaky connection. */
export const TUS_CHUNK_SIZE = 50 * 1024 * 1024;
export const TUS_RETRY_DELAYS = [0, 3000, 5000, 10_000, 20_000, 30_000];

export interface BunnyUploadOptions {
  lessonId: string;
  file: File;
  /** Whole seconds read from the file's metadata, if the browser knew. */
  durationSec?: number;
  /** Bytes sent so far, as a 0..1 fraction. */
  onProgress?: (fraction: number) => void;
  /** Fired once the last byte reached Bunny, before the API is told. */
  onSent?: () => void;
}

/** Maps a failed API call onto the outcomes the panel already understands. */
function failureOutcome(result: {
  kind: 'error' | 'unauthenticated';
  status: number;
}): UploadOutcome {
  if (result.kind === 'unauthenticated') {
    return { kind: 'http-error', status: 401 };
  }
  if (result.status === 0) return { kind: 'network-error' };
  return { kind: 'http-error', status: result.status };
}

function statusOf(error: Error): number | null {
  const response = (
    error as { originalResponse?: { getStatus(): number } | null }
  ).originalResponse;
  const status = response?.getStatus();
  return typeof status === 'number' && status > 0 ? status : null;
}

/**
 * Uploads one video straight to Bunny over TUS, in three steps: ask the API
 * for a signed upload (it creates the Bunny video; the library API key never
 * reaches the browser), send the file in resumable chunks, then tell the API
 * it finished so the asset moves to PROCESSING. The promise always resolves
 * with the same outcomes as the local uploader. Cancelling aborts the TUS
 * request and leaves the asset for the reconcile job to clear.
 */
export function startBunnyUpload(options: BunnyUploadOptions): VideoUpload {
  let settled = false;
  let aborted = false;
  let upload: tus.Upload | null = null;
  let finish: (outcome: UploadOutcome) => void = () => undefined;

  const promise = new Promise<UploadOutcome>((resolve) => {
    finish = (outcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
  });

  async function run(): Promise<void> {
    const created = await apiFetch<unknown>(
      `/api/v1/admin/lessons/${options.lessonId}/videos`,
      {
        method: 'POST',
        ...jsonRequest({
          originalName: options.file.name,
          sizeBytes: options.file.size,
          ...(options.durationSec === undefined
            ? {}
            : { durationSec: Math.round(options.durationSec) }),
        }),
      },
    );
    if (aborted) return finish({ kind: 'aborted' });
    if (!created.ok) return finish(failureOutcome(created));
    const parsed = bunnyUploadTicketSchema.safeParse(created.data);
    if (!parsed.success) return finish({ kind: 'http-error', status: 502 });
    const ticket: BunnyUploadTicket = parsed.data;

    upload = new tus.Upload(options.file, {
      endpoint: ticket.tus.endpoint,
      headers: ticket.tus.headers,
      metadata: ticket.metadata,
      chunkSize: TUS_CHUNK_SIZE,
      retryDelays: TUS_RETRY_DELAYS,
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => {
        if (total > 0) options.onProgress?.(Math.min(1, sent / total));
      },
      onError: (error) => {
        if (aborted) return finish({ kind: 'aborted' });
        const status = statusOf(error);
        finish(
          status === null
            ? { kind: 'network-error' }
            : { kind: 'http-error', status },
        );
      },
      onSuccess: () => {
        options.onProgress?.(1);
        options.onSent?.();
        void apiFetch<void>(`/api/v1/admin/videos/${ticket.assetId}/uploaded`, {
          method: 'POST',
        }).then((done) => {
          if (done.ok) {
            return finish({ kind: 'success', status: 204, data: ticket });
          }
          finish(failureOutcome(done));
        });
      },
    });
    upload.start();
  }

  void run().catch(() => finish({ kind: 'network-error' }));

  return {
    promise,
    abort: () => {
      if (settled) return;
      aborted = true;
      if (upload) {
        // Not terminating: the asset is left to the reconciler.
        void Promise.resolve(upload.abort(false)).finally(() =>
          finish({ kind: 'aborted' }),
        );
      }
    },
  };
}
