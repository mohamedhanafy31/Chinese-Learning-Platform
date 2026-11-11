import { NextIntlClientProvider } from 'next-intl';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrderStatus, type OrderSummary } from '@app/shared';

import messages from '../../../messages/en.json';
import { ResultStatus } from './result-status';
import { resetApiClientForTests } from '@/lib/api-client';

const pending: OrderSummary = {
  id: '00000000-0000-4000-8000-000000000001',
  status: OrderStatus.PENDING,
  levelId: '00000000-0000-4000-8000-000000000002',
  levelSlug: 'starter',
  levelTitle: { en: 'Starter Chinese' },
  amountMinor: 150_000,
  currency: 'EGP',
  createdAt: '2026-11-11T10:00:00.000Z',
  paidAt: null,
  expiresAt: '2026-11-11T11:00:00.000Z',
};

function show(props: Partial<React.ComponentProps<typeof ResultStatus>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ResultStatus initialOrder={pending} locale="en" {...props} />
    </NextIntlClientProvider>,
  );
}

function ok(order: OrderSummary): Response {
  return new Response(JSON.stringify(order), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ResultStatus polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetApiClientForTests();
  });

  it('stops polling as soon as the order becomes paid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        ok({
          ...pending,
          status: OrderStatus.PAID,
          paidAt: pending.createdAt,
        }),
      ),
    );
    show();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByTestId('billing-paid')).toBeVisible();
    expect(screen.getByTestId('purchase-seal')).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('times out after 60 seconds of visible polling', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(ok(pending))),
    );
    show();
    for (let seconds = 0; seconds < 60; seconds += 2) {
      await act(() => vi.advanceTimersByTimeAsync(2000));
    }
    expect(screen.getByTestId('billing-timeout')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
  });

  it('pauses while the tab is hidden and resumes when visible', async () => {
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => visibility,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(ok(pending))),
    );
    show();
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(fetch).not.toHaveBeenCalled();
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('cleans up its timer on unmount', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(ok(pending))),
    );
    const view = show();
    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('restarts a fresh window when Check again is pressed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(ok(pending))),
    );
    show({ pollWindowMs: 4000 });
    await act(() => vi.advanceTimersByTimeAsync(4000));
    vi.mocked(fetch).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(screen.getByTestId('billing-confirming')).toBeVisible();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(fetch).toHaveBeenCalledOnce();
  });
});
