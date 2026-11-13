import { apiFetch } from './api-client';

export type UploadOutcome =
  | { kind: 'success'; status: number; data: unknown }
  | { kind: 'http-error'; status: number }
  | { kind: 'network-error' }
  | { kind: 'aborted' };

export interface VideoUploadOptions {
  /** Absolute API URL in development, or the same-origin `/api/...` path. */
  url: string;
  file: File;
  /** Whole seconds the browser read from the file's metadata, if known. */
  durationSec?: number;
  /** Bytes of the request body sent so far, as a 0..1 fraction. */
  onProgress?: (fraction: number) => void;
  /** Fired once every byte has left the browser, before the server answers. */
  onSent?: () => void;
}

export interface VideoUpload {
  promise: Promise<UploadOutcome>;
  abort: () => void;
}

function parseBody(text: string): unknown {
  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

/**
 * Uploads one video with `XMLHttpRequest` (fetch cannot report upload
 * progress). The promise always resolves, never rejects: callers branch on the
 * outcome. Credentials are sent so the cookie session works across the dev
 * API origin; the browser adds `Origin`, which the API's origin guard checks.
 */
export function startVideoUpload(options: VideoUploadOptions): VideoUpload {
  let request: XMLHttpRequest | null = null;
  let settled = false;
  let aborted = false;
  let attempt = 0;
  let sentReported = false;
  let finish: (outcome: UploadOutcome) => void = () => undefined;

  const promise = new Promise<UploadOutcome>((resolve) => {
    finish = (outcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
  });

  const body = (): FormData => {
    const form = new FormData();
    if (options.durationSec !== undefined) {
      form.append('durationSec', String(Math.round(options.durationSec)));
    }
    // The file goes last so the API sees the text field before the bytes.
    form.append('file', options.file);
    return form;
  };

  const send = (): void => {
    if (settled || aborted) {
      finish({ kind: 'aborted' });
      return;
    }
    const xhr = new XMLHttpRequest();
    request = xhr;
    attempt += 1;
    xhr.open('POST', options.url);
    xhr.withCredentials = true;
    xhr.responseType = 'text';
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress?.(Math.min(1, event.loaded / event.total));
      }
    });
    xhr.upload.addEventListener('load', () => {
      options.onProgress?.(1);
      if (!sentReported) {
        sentReported = true;
        options.onSent?.();
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status === 401 && attempt === 1) {
        void apiFetch('/api/v1/auth/me')
          .then((session) => {
            if (aborted) {
              finish({ kind: 'aborted' });
            } else if (session.ok) {
              send();
            } else {
              finish({ kind: 'http-error', status: 401 });
            }
          })
          .catch(() => finish({ kind: 'http-error', status: 401 }));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        finish({
          kind: 'success',
          status: xhr.status,
          data: parseBody(xhr.responseText),
        });
      } else {
        finish({ kind: 'http-error', status: xhr.status });
      }
    });
    xhr.addEventListener('error', () => finish({ kind: 'network-error' }));
    xhr.addEventListener('timeout', () => finish({ kind: 'network-error' }));
    xhr.addEventListener('abort', () => finish({ kind: 'aborted' }));
    xhr.send(body());
  };

  void apiFetch('/api/v1/auth/me')
    .then((session) => {
      if (aborted) {
        finish({ kind: 'aborted' });
      } else if (!session.ok && session.kind === 'unauthenticated') {
        finish({ kind: 'http-error', status: 401 });
      } else {
        send();
      }
    })
    .catch(send);

  return {
    promise,
    abort: () => {
      if (settled) return;
      aborted = true;
      request?.abort();
      finish({ kind: 'aborted' });
    },
  };
}

/**
 * Reads a video's duration in whole seconds from its metadata, using a
 * detached `<video>`. Resolves undefined when the browser cannot tell.
 */
export function readVideoDuration(
  file: File,
  timeoutMs = 5000,
): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (value: number | undefined): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      const seconds = Math.round(video.duration);
      finish(Number.isFinite(seconds) && seconds >= 1 ? seconds : undefined);
    };
    video.onerror = () => finish(undefined);
    video.src = url;
  });
}
