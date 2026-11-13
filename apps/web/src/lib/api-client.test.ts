import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  apiFetch,
  apiFetchParsed,
  resetApiClientForTests,
} from '@/lib/api-client';
import { z } from 'zod';

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetApiClientForTests();
  });

  it('shares one locked refresh across concurrent 401 responses', async () => {
    let releaseRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      releaseRefresh = resolve;
    });
    const lockRequest = vi.fn(
      async (_name: string, callback: () => Promise<Response | null>) =>
        callback(),
    );
    vi.stubGlobal('navigator', { locks: { request: lockRequest } });
    let protectedCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/v1/auth/refresh') return refreshResponse;
      protectedCalls += 1;
      if (protectedCalls <= 2) {
        return Promise.resolve(new Response(null, { status: 401 }));
      }
      return Promise.resolve(Response.json({ ok: true }, { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = apiFetch<{ ok: boolean }>('/api/v1/lessons');
    const second = apiFetch<{ ok: boolean }>('/api/v1/lessons');
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/auth/refresh',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    releaseRefresh?.(new Response(null, { status: 200 }));

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ ok: true, data: { ok: true } }),
      expect.objectContaining({ ok: true, data: { ok: true } }),
    ]);
    expect(lockRequest).toHaveBeenCalledWith(
      'auth-refresh',
      expect.any(Function),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === '/api/v1/auth/refresh',
      ),
    ).toHaveLength(1);
    expect(protectedCalls).toBe(4);
  });

  it('accepts a successful /me check after a refresh 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ user: { role: 'STUDENT' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/v1/auth/refresh')).resolves.toMatchObject({
      ok: true,
      data: { user: { role: 'STUDENT' } },
    });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/v1/auth/refresh',
      '/api/v1/auth/me',
    ]);
  });

  it('returns unauthenticated when refresh and /me both fail', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/v1/lessons')).resolves.toEqual({
      ok: false,
      kind: 'unauthenticated',
      status: 401,
    });
  });

  it('refreshes and retries an unauthenticated session check', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ user: { id: 'user-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/v1/auth/me')).resolves.toMatchObject({
      ok: true,
      data: { user: { id: 'user-1' } },
    });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/v1/auth/me',
      '/api/v1/auth/refresh',
      '/api/v1/auth/me',
    ]);
  });
});

describe('apiFetchParsed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetApiClientForTests();
  });

  const schema = z.object({ id: z.string() });

  it('returns parsed data and reports an invalid body without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ id: 'a' })),
    );
    await expect(apiFetchParsed('/api/data', schema)).resolves.toMatchObject({
      ok: true,
      data: { id: 'a' },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id: 1 })));
    await expect(apiFetchParsed('/api/data', schema)).resolves.toMatchObject({
      ok: false,
      kind: 'invalid',
      status: 200,
    });
  });

  it('refreshes after 401 and validates the retried body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ id: 'fresh' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiFetchParsed('/api/data', schema)).resolves.toMatchObject({
      ok: true,
      data: { id: 'fresh' },
    });
  });

  it('returns network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(apiFetchParsed('/api/data', schema)).resolves.toMatchObject({
      ok: false,
      kind: 'error',
      status: 0,
    });
  });
});
