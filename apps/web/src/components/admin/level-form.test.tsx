import { NextIntlClientProvider } from 'next-intl';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en.json';
import { LevelForm } from './level-form';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/levels/new',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

describe('LevelForm', () => {
  afterEach(cleanup);

  it('clears a field error as soon as that field changes', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LevelForm locale="en" />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create level' }));
    expect(
      await screen.findAllByText('This field is required.'),
    ).not.toHaveLength(0);

    const englishTitle = document.getElementById('level-title-en');
    expect(englishTitle).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(englishTitle!, { target: { value: 'Beginner Mandarin' } });

    expect(englishTitle).not.toHaveAttribute('aria-invalid');
    expect(document.getElementById('level-title-en-error')).toBeNull();
  });
});
