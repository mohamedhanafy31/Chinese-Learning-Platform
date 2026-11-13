import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LogoutButton } from '@/components/auth/logout-button';
import { resetApiClientForTests } from '@/lib/api-client';

const navigation = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
}));

describe('LogoutButton', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetApiClientForTests();
  });

  const ok = (): Response => new Response(null, { status: 204 });
  const down = (): Promise<Response> => Promise.reject(new Error('offline'));

  function clickLogout(portal: 'admin' | 'student' = 'student'): void {
    render(
      <LogoutButton
        locale="ar"
        portal={portal}
        label="Log out"
        pendingLabel="Logging out"
        errorLabel="Try again"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
  }

  it.each([
    ['student', '/ar/login'],
    ['admin', '/ar/admin/login'],
  ] as const)(
    'revokes via the API, then clears locally and returns to the %s portal',
    async (portal, destination) => {
      const fetchMock = vi.fn().mockImplementation(async () => ok());
      vi.stubGlobal('fetch', fetchMock);

      clickLogout(portal);

      await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        '/api/v1/auth/logout',
        '/api/auth/logout',
      ]);
      for (const [, init] of fetchMock.mock.calls) {
        expect(init).toMatchObject({
          credentials: 'same-origin',
          method: 'POST',
        });
      }
      expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
      expect(navigation.replace).toHaveBeenCalledWith(destination);
      expect(navigation.refresh).toHaveBeenCalled();
      expect(screen.queryByText('Try again')).toBeNull();
    },
  );

  it('still logs out when the API is down but local cleanup succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(down)
      .mockImplementationOnce(async () => ok());
    vi.stubGlobal('fetch', fetchMock);

    clickLogout();

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/ar/login'),
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/auth/logout',
      '/api/auth/logout',
    ]);
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('still logs out when the API revokes but local cleanup fails', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => ok())
      .mockImplementationOnce(async () => new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    clickLogout();

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/ar/login'),
    );
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('shows the retry error and stays put only when both requests fail', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(down)
      .mockImplementationOnce(async () => new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    clickLogout();

    expect(await screen.findByText('Try again')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'Log out' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
