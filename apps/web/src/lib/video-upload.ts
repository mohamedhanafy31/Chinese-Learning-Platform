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
  const request = new XMLHttpRequest();
  let settled = false;
  let finish: (outcome: UploadOutcome) => void = () => undefined;

  const promise = new Promise<UploadOutcome>((resolve) => {
    finish = (outcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
  });

  request.open('POST', options.url);
  request.withCredentials = true;
  request.responseType = 'text';

  request.upload.addEventListener('progress', (event) => {
    if (event.lengthComputable && event.total > 0) {
      options.onProgress?.(Math.min(1, event.loaded / event.total));
    }
  });
  request.upload.addEventListener('load', () => {
    options.onProgress?.(1);
    options.onSent?.();
  });
  request.addEventListener('load', () => {
    if (request.status >= 200 && request.status < 300) {
      finish({
        kind: 'success',
        status: request.status,
        data: parseBody(request.responseText),
      });
    } else {
      finish({ kind: 'http-error', status: request.status });
    }
  });
  request.addEventListener('error', () => finish({ kind: 'network-error' }));
  request.addEventListener('timeout', () => finish({ kind: 'network-error' }));
  request.addEventListener('abort', () => finish({ kind: 'aborted' }));

  const body = new FormData();
  if (options.durationSec !== undefined) {
    body.append('durationSec', String(Math.round(options.durationSec)));
  }
  // The file goes last so the API sees the text field before the bytes.
  body.append('file', options.file);
  request.send(body);

  return {
    promise,
    abort: () => {
      if (!settled) request.abort();
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
