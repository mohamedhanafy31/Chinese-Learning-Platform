import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetApiClientForTests } from './api-client';
import { startBunnyUpload, TUS_CHUNK_SIZE } from './bunny-upload';

interface UploadOptions {
  endpoint: string;
  headers: Record<string, string>;
  metadata: Record<string, string>;
  chunkSize: number;
  retryDelays: number[];
  onProgress: (sent: number, total: number) => void;
  onSuccess: () => void;
  onError: (error: Error) => void;
}

const tusState = vi.hoisted(() => ({
  instances: [] as Array<{
    file: unknown;
    options: UploadOptions;
    started: boolean;
    abortArgs: unknown[];
  }>,
}));

vi.mock('tus-js-client', () => ({
  Upload: class {
    started = false;
    abortArgs: unknown[] = [];
    constructor(
      public file: unknown,
      public options: UploadOptions,
    ) {
      tusState.instances.push(this);
    }
    start(): void {
      this.started = true;
    }
    abort(...args: unknown[]): Promise<void> {
      this.abortArgs = args;
      return Promise.resolve();
    }
  },
}));

const ASSET_ID = '3f2b8c1e-6d1a-4a53-9c1d-2f2d7a9b0c11';
const ticket = {
  assetId: ASSET_ID,
  tus: {
    endpoint: 'https://video.bunnycdn.com/tusupload',
    headers: {
      AuthorizationSignature: 'sig',
      AuthorizationExpire: '1700000000',
      VideoId: 'guid-1',
      LibraryId: '4242',
    },
  },
  metadata: { filetype: 'video/mp4', title: 'level / 1 / a.mp4' },
};

const json = (body: unknown, status = 201): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const file = new File([new Uint8Array(10)], 'a.mp4', { type: 'video/mp4' });

/** Lets the create-ticket request settle so the TUS upload exists. */
async function tusUpload() {
  await vi.waitFor(() => expect(tusState.instances).toHaveLength(1));
  const instance = tusState.instances[0];
  if (!instance) throw new Error('no tus upload');
  return instance;
}

describe('startBunnyUpload', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tusState.instances.length = 0;
    resetApiClientForTests();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the API for a ticket, uploads with its headers, reports progress, then marks it uploaded', async () => {
    fetchMock
      .mockResolvedValueOnce(json(ticket))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const onProgress = vi.fn();
    const onSent = vi.fn();
    const upload = startBunnyUpload({
      lessonId: 'lesson-1',
      file,
      durationSec: 90.4,
      onProgress,
      onSent,
    });

    const tus = await tusUpload();
    const [createUrl, createInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(createUrl).toBe('/api/v1/admin/lessons/lesson-1/videos');
    expect(createInit.method).toBe('POST');
    expect(JSON.parse(createInit.body as string)).toEqual({
      originalName: 'a.mp4',
      sizeBytes: 10,
      durationSec: 90,
    });

    expect(tus.file).toBe(file);
    expect(tus.started).toBe(true);
    expect(tus.options.endpoint).toBe(ticket.tus.endpoint);
    expect(tus.options.headers).toEqual(ticket.tus.headers);
    expect(tus.options.metadata).toEqual(ticket.metadata);
    expect(tus.options.chunkSize).toBe(TUS_CHUNK_SIZE);
    expect(TUS_CHUNK_SIZE).toBe(50 * 1024 * 1024);
    expect(tus.options.retryDelays.length).toBeGreaterThan(0);
    // The browser never receives, and so never sends, the library API key.
    expect(JSON.stringify(tus.options.headers)).not.toMatch(/AccessKey/i);

    tus.options.onProgress(5, 10);
    expect(onProgress).toHaveBeenLastCalledWith(0.5);
    tus.options.onSuccess();

    const outcome = await upload.promise;
    expect(outcome.kind).toBe('success');
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith(1);
    const [uploadedUrl, uploadedInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(uploadedUrl).toBe(`/api/v1/admin/videos/${ASSET_ID}/uploaded`);
    expect(uploadedInit.method).toBe('POST');
  });

  it('reports an HTTP failure from Bunny with its status', async () => {
    fetchMock.mockResolvedValueOnce(json(ticket));
    const upload = startBunnyUpload({ lessonId: 'l', file });
    const tus = await tusUpload();
    const error = Object.assign(new Error('bad'), {
      originalResponse: { getStatus: () => 403 },
    });
    tus.options.onError(error);
    expect(await upload.promise).toEqual({ kind: 'http-error', status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a network error when there is no response', async () => {
    fetchMock.mockResolvedValueOnce(json(ticket));
    const upload = startBunnyUpload({ lessonId: 'l', file });
    (await tusUpload()).options.onError(new Error('offline'));
    expect(await upload.promise).toEqual({ kind: 'network-error' });
  });

  it('surfaces a failed ticket request without starting a TUS upload', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'no' }, 409));
    const upload = startBunnyUpload({ lessonId: 'l', file });
    expect(await upload.promise).toEqual({ kind: 'http-error', status: 409 });
    expect(tusState.instances).toHaveLength(0);
  });

  it('reports a network error when the ticket request cannot be made', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const upload = startBunnyUpload({ lessonId: 'l', file });
    expect(await upload.promise).toEqual({ kind: 'network-error' });
  });

  it('fails when the API says the upload could not be marked finished', async () => {
    fetchMock
      .mockResolvedValueOnce(json(ticket))
      .mockResolvedValueOnce(json({ message: 'nope' }, 404));
    const upload = startBunnyUpload({ lessonId: 'l', file });
    (await tusUpload()).options.onSuccess();
    expect(await upload.promise).toEqual({ kind: 'http-error', status: 404 });
  });

  it('abort stops the TUS upload without terminating it, and resolves aborted', async () => {
    fetchMock.mockResolvedValueOnce(json(ticket));
    const upload = startBunnyUpload({ lessonId: 'l', file });
    const tus = await tusUpload();
    upload.abort();
    expect(await upload.promise).toEqual({ kind: 'aborted' });
    expect(tus.abortArgs).toEqual([false]);
    // Nothing is told to the API: the reconciler clears the asset later.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('abort before the ticket arrives never starts TUS', async () => {
    let release: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );
    const upload = startBunnyUpload({ lessonId: 'l', file });
    upload.abort();
    release(json(ticket));
    expect(await upload.promise).toEqual({ kind: 'aborted' });
    expect(tusState.instances).toHaveLength(0);
  });
});
