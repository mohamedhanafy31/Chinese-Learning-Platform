export type ApiResult<T> =
  | { ok: true; data: T; response: Response }
  | {
      ok: false;
      kind: 'error' | 'unauthenticated';
      status: number;
      response?: Response;
    };

let refreshPromise: Promise<boolean> | null = null;

function isAuthEndpoint(path: string): boolean {
  return path.startsWith('/api/v1/auth/');
}

async function refreshSession(): Promise<boolean> {
  refreshPromise ??= fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function parseSuccess<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const requestInit: RequestInit = {
    ...init,
    credentials: 'same-origin',
  };
  const response = await fetch(path, requestInit).catch(() => null);

  if (!response) return { ok: false, kind: 'error', status: 0 };
  if (response.ok) {
    return { ok: true, data: await parseSuccess<T>(response), response };
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
