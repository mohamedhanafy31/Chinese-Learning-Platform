import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from './api-client';
import { startVideoUpload } from './video-upload';

vi.mock('./api-client', () => ({ apiFetch: vi.fn() }));

type Listener = (event: unknown) => void;

class MockXhr {
  static instances: MockXhr[] = [];

  method = '';
  url = '';
  withCredentials = false;
  responseType = '';
  status = 0;
  responseText = '';
  sent: FormData | null = null;
  aborted = false;
  private listeners = new Map<string, Listener[]>();
  upload = {
    listeners: new Map<string, Listener[]>(),
    addEventListener: (type: string, listener: Listener) => {
      const list = this.upload.listeners.get(type) ?? [];
      list.push(listener);
      this.upload.listeners.set(type, list);
    },
  };

  constructor() {
    MockXhr.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(body: FormData): void {
    this.sent = body;
  }

  abort(): void {
    this.aborted = true;
    this.emit('abort');
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  emitUpload(type: string, event: unknown = {}): void {
    for (const listener of this.upload.listeners.get(type) ?? [])
      listener(event);
  }

  respond(status: number, body: string): void {
    this.status = status;
    this.responseText = body;
    this.emit('load');
  }
}

const file = new File([new Uint8Array(10)], 'lesson.mp4', {
  type: 'video/mp4',
});

function latest(): MockXhr {
  const instance = MockXhr.instances.at(-1);
  if (!instance) throw new Error('No XHR was created');
  return instance;
}

async function start(options: Parameters<typeof startVideoUpload>[0]) {
  const expectedRequests = MockXhr.instances.length + 1;
  const upload = startVideoUpload(options);
  await vi.waitFor(() =>
    expect(MockXhr.instances).toHaveLength(expectedRequests),
  );
  return upload;
}

const sessionOk = {
  ok: true as const,
  data: { id: 'user' },
  response: new Response(null, { status: 200 }),
};

describe('startVideoUpload', () => {
  beforeEach(() => {
    MockXhr.instances = [];
    vi.stubGlobal('XMLHttpRequest', MockXhr);
    vi.mocked(apiFetch).mockClear();
    vi.mocked(apiFetch).mockResolvedValue(sessionOk);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('checks the session, then posts the file and duration with credentials', async () => {
    await start({ url: 'http://api.test/up', file, durationSec: 61.4 });
    const xhr = latest();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('http://api.test/up');
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.sent?.get('durationSec')).toBe('61');
    expect((xhr.sent?.get('file') as File).name).toBe('lesson.mp4');
    expect([...(xhr.sent?.keys() ?? [])]).toEqual(['durationSec', 'file']);
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/auth/me');
  });

  it('omits the duration when the browser could not read it', async () => {
    await start({ url: '/up', file });
    expect(latest().sent?.has('durationSec')).toBe(false);
  });

  it('reports progress as a clamped fraction and signals when sent', async () => {
    const onProgress = vi.fn();
    const onSent = vi.fn();
    await start({ url: '/up', file, onProgress, onSent });
    const xhr = latest();
    xhr.emitUpload('progress', {
      lengthComputable: true,
      loaded: 25,
      total: 100,
    });
    xhr.emitUpload('progress', {
      lengthComputable: false,
      loaded: 50,
      total: 0,
    });
    xhr.emitUpload('progress', {
      lengthComputable: true,
      loaded: 200,
      total: 100,
    });
    expect(onProgress.mock.calls.map(([value]) => value)).toEqual([0.25, 1]);
    expect(onSent).not.toHaveBeenCalled();
    xhr.emitUpload('load');
    expect(onProgress).toHaveBeenLastCalledWith(1);
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('resolves success with the parsed JSON body', async () => {
    const upload = await start({ url: '/up', file });
    latest().respond(201, JSON.stringify({ id: 'abc' }));
    await expect(upload.promise).resolves.toEqual({
      kind: 'success',
      status: 201,
      data: { id: 'abc' },
    });
  });

  it('resolves success with null data when the body is not JSON', async () => {
    const upload = await start({ url: '/up', file });
    latest().respond(201, 'not json');
    await expect(upload.promise).resolves.toEqual({
      kind: 'success',
      status: 201,
      data: null,
    });
  });

  it('refreshes through the session check once after an XHR 401, then retries', async () => {
    const upload = await start({ url: '/up', file });
    const firstBody = latest().sent;
    latest().respond(401, '{}');
    await vi.waitFor(() => expect(MockXhr.instances).toHaveLength(2));
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(latest().sent).not.toBe(firstBody);
    expect((latest().sent?.get('file') as File).name).toBe('lesson.mp4');
    latest().respond(201, '{"uploaded":true}');
    await expect(upload.promise).resolves.toEqual({
      kind: 'success',
      status: 201,
      data: { uploaded: true },
    });
  });

  it('returns http-error 401 when the retry also answers 401', async () => {
    const upload = await start({ url: '/up', file });
    latest().respond(401, '{}');
    await vi.waitFor(() => expect(MockXhr.instances).toHaveLength(2));
    latest().respond(401, '{}');
    await expect(upload.promise).resolves.toEqual({
      kind: 'http-error',
      status: 401,
    });
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('aborts while the session refresh is pending before retry', async () => {
    let resolveSession: ((value: typeof sessionOk) => void) | undefined;
    const pendingSession = new Promise<typeof sessionOk>((resolve) => {
      resolveSession = resolve;
    });
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(sessionOk)
      .mockReturnValueOnce(pendingSession);
    const upload = await start({ url: '/up', file });
    latest().respond(401, '{}');
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    upload.abort();
    await expect(upload.promise).resolves.toEqual({ kind: 'aborted' });
    resolveSession?.(sessionOk);
    await Promise.resolve();
    expect(MockXhr.instances).toHaveLength(1);
  });

  it('resolves http errors with the status except 401, which checks the session once', async () => {
    for (const status of [401, 403, 413, 415, 500]) {
      const upload = await start({ url: '/up', file });
      latest().respond(status, '{}');
      if (status === 401) {
        await vi.waitFor(() => expect(MockXhr.instances).toHaveLength(2));
        latest().respond(401, '{}');
      }
      await expect(upload.promise).resolves.toEqual({
        kind: 'http-error',
        status,
      });
    }
  });

  it('resolves a network error on error and timeout events', async () => {
    const first = await start({ url: '/up', file });
    latest().emit('error');
    await expect(first.promise).resolves.toEqual({ kind: 'network-error' });
    const second = await start({ url: '/up', file });
    latest().emit('timeout');
    await expect(second.promise).resolves.toEqual({ kind: 'network-error' });
  });

  it('aborts the request and resolves aborted', async () => {
    const upload = await start({ url: '/up', file });
    upload.abort();
    expect(latest().aborted).toBe(true);
    await expect(upload.promise).resolves.toEqual({ kind: 'aborted' });
  });

  it('ignores an abort after the upload has finished, and late events', async () => {
    const upload = await start({ url: '/up', file });
    const xhr = latest();
    xhr.respond(201, '{}');
    await upload.promise;
    upload.abort();
    expect(xhr.aborted).toBe(false);
    xhr.emit('error');
    await expect(upload.promise).resolves.toMatchObject({ kind: 'success' });
  });
});
