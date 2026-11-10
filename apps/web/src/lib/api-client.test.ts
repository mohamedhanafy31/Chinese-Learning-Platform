import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiFetch, resetApiClientForTests } from '@/lib/api-client';

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetApiClientForTests();
  });

  it('shares one refresh across concurrent 401 responses and retries once', async () => {
    let releaseRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      releaseRefresh = resolve;
    });
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
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === '/api/v1/auth/refresh',
      ),
    ).toHaveLength(1);
    expect(protectedCalls).toBe(4);
  });

  it('returns unauthenticated when refresh fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/v1/lessons')).resolves.toEqual({
      ok: false,
      kind: 'unauthenticated',
      status: 401,
    });
  });
});
