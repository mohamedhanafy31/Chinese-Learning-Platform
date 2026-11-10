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
import { LoginForm } from '@/components/auth/login-form';
import { resetApiClientForTests } from '@/lib/api-client';

const navigation = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LoginForm locale="en" />
    </NextIntlClientProvider>,
  );
}

describe('LoginForm', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetApiClientForTests();
  });

  it('renders visible labels and accessible validation errors', async () => {
    renderForm();
    expect(screen.getByLabelText('Email address')).toBeVisible();
    expect(screen.getByLabelText('Password')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(
      await screen.findByText('Enter a valid email address.'),
    ).toBeVisible();
    expect(screen.getByText('Enter at least 8 characters.')).toBeVisible();
    expect(screen.getByLabelText('Email address')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('Email address')).toHaveFocus();
  });

  it('disables the submit button and changes its label while pending', async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    renderForm();
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'student@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    const pending = await screen.findByRole('button', { name: 'Logging in…' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');

    resolveFetch?.(new Response(null, { status: 500 }));
    await waitFor(() => expect(pending).not.toBeDisabled());
  });
});
