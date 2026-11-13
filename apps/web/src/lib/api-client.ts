import type { z, ZodType } from 'zod';

export type ApiResult<T> =
  | { ok: true; data: T; response: Response }
  | {
      ok: false;
      kind: 'error' | 'unauthenticated' | 'invalid';
      status: number;
      response?: Response;
    };

let refreshPromise: Promise<Response | null> | null = null;

const REFRESH_PATH = '/api/v1/auth/refresh';
const ME_PATH = '/api/v1/auth/me';

function isAuthEndpoint(path: string): boolean {
  return path.startsWith('/api/v1/auth/');
}

export async function apiFetchParsed<S extends ZodType>(
  path: string,
  schema: S,
  init: RequestInit = {},
): Promise<ApiResult<z.infer<S>>> {
  const result = await apiFetch<unknown>(path, init);
  if (!result.ok) return result;
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) {
    return {
      ok: false,
      kind: 'invalid',
      status: result.response.status,
      response: result.response,
    };
  }
  return { ...result, data: parsed.data };
}

async function runRefresh(): Promise<Response | null> {
  const attempt = async (): Promise<Response | null> => {
    const refreshed = await fetch(REFRESH_PATH, {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => null);
    if (refreshed?.ok) return refreshed;

    // Another tab may have rotated the shared refresh cookie while this tab
    // waited for the cross-tab lock. Verify that the winning cookies work.
    const currentUser = await fetch(ME_PATH, {
      method: 'GET',
      credentials: 'same-origin',
    }).catch(() => null);
    return currentUser?.ok ? currentUser : null;
  };

  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('auth-refresh', attempt);
  }
  return attempt();
}

function refreshSession(): Promise<Response | null> {
  refreshPromise ??= runRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function parseSuccess<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  return (await response.json().catch(() => undefined)) as T;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const requestInit: RequestInit = {
    ...init,
    credentials: 'same-origin',
  };

  if (path === REFRESH_PATH) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      return { ok: false, kind: 'unauthenticated', status: 401 };
    }
    return {
      ok: true,
      data: await parseSuccess<T>(refreshed),
      response: refreshed,
    };
  }

  const response = await fetch(path, requestInit).catch(() => null);

  if (!response) return { ok: false, kind: 'error', status: 0 };
  if (response.ok) {
    return { ok: true, data: await parseSuccess<T>(response), response };
  }
  if (response.status === 401 && path === ME_PATH) {
    if (!(await refreshSession())) {
      return { ok: false, kind: 'unauthenticated', status: 401 };
    }
    const retried = await fetch(path, requestInit).catch(() => null);
    if (!retried) return { ok: false, kind: 'error', status: 0 };
    if (retried.ok) {
      return {
        ok: true,
        data: await parseSuccess<T>(retried),
        response: retried,
      };
    }
    return {
      ok: false,
      kind: retried.status === 401 ? 'unauthenticated' : 'error',
      status: retried.status,
      response: retried,
    };
  }
  if (response.status !== 401 || isAuthEndpoint(path)) {
    return { ok: false, kind: 'error', status: response.status, response };
  }

  if (!(await refreshSession())) {
    return { ok: false, kind: 'unauthenticated', status: 401 };
  }

  const retried = await fetch(path, requestInit).catch(() => null);
  if (!retried) return { ok: false, kind: 'error', status: 0 };
  if (retried.ok) {
    return {
      ok: true,
      data: await parseSuccess<T>(retried),
      response: retried,
    };
  }
  return {
    ok: false,
    kind: retried.status === 401 ? 'unauthenticated' : 'error',
    status: retried.status,
    response: retried,
  };
}

export function jsonRequest(
  body: unknown,
  init: RequestInit = {},
): RequestInit {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  return { ...init, body: JSON.stringify(body), headers };
}

export function resetApiClientForTests(): void {
  refreshPromise = null;
}
