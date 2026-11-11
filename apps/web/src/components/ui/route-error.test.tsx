import { NextIntlClientProvider } from 'next-intl';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import arMessages from '../../../messages/ar.json';
import enMessages from '../../../messages/en.json';
import { RouteError } from './route-error';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function show(locale: 'en' | 'ar', reset: () => void) {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? enMessages : arMessages}
    >
      <RouteError error={new Error('boom')} reset={reset} />
    </NextIntlClientProvider>,
  );
}

describe('RouteError', () => {
  it('says something honest, without leaking the error', () => {
    show('en', vi.fn());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).toBeNull();
  });

  it('retries by calling reset', () => {
    const reset = vi.fn();
    show('en', reset);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('links home in the current locale and speaks Arabic', () => {
    show('ar', vi.fn());
    expect(
      screen.getByRole('link', { name: 'العودة إلى الصفحة الرئيسية' }),
    ).toHaveAttribute('href', '/ar');
    expect(
      screen.getByRole('button', { name: 'حاول مرة أخرى' }),
    ).toBeInTheDocument();
  });

  it('logs the error for the browser console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('boom');
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <RouteError error={error} reset={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(spy).toHaveBeenCalledWith(error);
  });
});
