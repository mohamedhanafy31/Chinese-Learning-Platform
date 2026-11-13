// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const publicOrigin = 'https://school.example.com';

function logoutRequest(origin: string | null): NextRequest {
  return new NextRequest('http://web:3000/api/auth/logout', {
    headers: origin ? { origin } : {},
    method: 'POST',
  });
}

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.stubEnv('APP_URL', publicOrigin);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('expires both identity cookies without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(logoutRequest(publicOrigin));

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
    const access = response.cookies.get('access_token');
    const refresh = response.cookies.get('refresh_token');
    expect(access).toMatchObject({ value: '', path: '/', httpOnly: true });
    expect(refresh).toMatchObject({
      value: '',
      path: '/api/v1/auth',
      httpOnly: true,
    });
    expect(access?.expires).toEqual(new Date(0));
    expect(refresh?.expires).toEqual(new Date(0));
  });

  it.each([
    ['a missing Origin', null],
    ['a foreign Origin', 'https://attacker.example.com'],
  ])('rejects %s without setting cookies', async (_name, origin) => {
    const response = await POST(logoutRequest(origin));

    expect(response.status).toBe(403);
    expect(response.cookies.getAll()).toHaveLength(0);
  });
});
