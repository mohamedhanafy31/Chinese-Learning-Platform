import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LocaleSwitcher } from './locale-switcher';

describe('LocaleSwitcher', () => {
  it('marks the current locale and links to the others', () => {
    render(<LocaleSwitcher currentLocale="en" label="Languages" />);

    expect(screen.getByText('English')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'العربية' })).toHaveAttribute(
      'href',
      '/ar',
    );
    expect(screen.getByRole('link', { name: '中文' })).toHaveAttribute(
      'href',
      '/zh',
    );
  });
});
