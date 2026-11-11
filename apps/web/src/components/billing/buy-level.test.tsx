import { NextIntlClientProvider } from 'next-intl';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en.json';
import { BuyLevel } from './buy-level';
import { resetApiClientForTests } from '@/lib/api-client';

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

const props = {
  available: true,
  levelId: '00000000-0000-4000-8000-000000000001',
  levelPath: '/en/levels/one',
  locale: 'en' as const,
  price: 'EGP 1,500',
  signedIn: true,
};

function show(overrides: Partial<typeof props> = {}): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BuyLevel {...props} {...overrides} />
    </NextIntlClientProvider>,
  );
}

function response(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('BuyLevel', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetApiClientForTests();
  });

  it('shows the primary buy action when payments are available', () => {
    show();
    expect(
      screen.getByRole('button', { name: 'Buy level · EGP 1,500' }),
    ).toBeEnabled();
  });

  it('shows an honest disabled state when payments are unavailable', () => {
    show({ available: false });
    expect(
      screen.getByRole('button', { name: 'Buy level · EGP 1,500' }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        'Online payment opens soon — contact Mazen to join now.',
      ),
    ).toBeVisible();
  });

  it('sends anonymous learners to register or sign in with the level as next', () => {
    show({ signedIn: false });
    expect(
      screen.getByRole('link', {
        name: 'Create an account and buy · EGP 1,500',
      }),
    ).toHaveAttribute('href', '/en/register?next=%2Fen%2Flevels%2Fone');
    expect(
      screen.getByRole('link', { name: 'Already have an account? Sign in' }),
    ).toHaveAttribute('href', '/en/login?next=%2Fen%2Flevels%2Fone');
  });

  it('sets aria-busy and prevents a second submit while checkout is pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    show();
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      503,
      { reason: 'payments-unavailable' },
      'Online payment is unavailable right now. Contact Mazen or try later.',
    ],
    [
      502,
      { reason: 'provider-error' },
      'The payment provider could not be reached. Nothing was charged; try again.',
    ],
    [429, {}, 'Too many checkout attempts. Wait a minute and try again.'],
    [409, { reason: 'not-for-sale' }, 'This level is not for sale right now.'],
    [0, null, 'Checkout could not start. Check your connection and try again.'],
  ])(
    'maps checkout failure %s to specific recovery copy',
    async (status, body, copy) => {
      vi.stubGlobal(
        'fetch',
        status === 0
          ? vi.fn().mockRejectedValue(new Error('offline'))
          : vi.fn().mockResolvedValue(response(status, body)),
      );
      show();
      fireEvent.click(screen.getByRole('button'));
      expect(await screen.findByRole('alert')).toHaveTextContent(copy);
      expect(screen.getByRole('button')).not.toHaveAttribute(
        'aria-busy',
        'true',
      );
    },
  );

  it('refreshes the level when checkout reports an existing enrollment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(409, { reason: 'already-enrolled' })),
    );
    show();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
