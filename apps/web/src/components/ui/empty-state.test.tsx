import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EmptyState } from './empty-state';

afterEach(cleanup);

describe('EmptyState', () => {
  it('is a dashed unfired block with cobalt text and its one action', () => {
    render(
      <EmptyState
        title="No levels yet"
        body="Create the first level to get started."
        action={{ href: '/en/admin/levels/new', label: 'New level' }}
      />,
    );
    const block = document.querySelector('[data-empty-state]')!;
    expect(block).toHaveClass(
      'border-dashed',
      'border-unfired',
      'rounded-2xl',
      'text-cobalt',
    );
    expect(screen.getByText('No levels yet')).toBeInTheDocument();
    expect(
      screen.getByText('Create the first level to get started.'),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'New level' });
    expect(link).toHaveAttribute('href', '/en/admin/levels/new');
  });

  it('shows no link when there is no action, and no title when none is given', () => {
    render(<EmptyState body="Nothing here." />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
  });

  it('never reaches for red or the seal', () => {
    render(<EmptyState body="x" action={{ href: '/a', label: 'go' }} />);
    const classes = Array.from(document.querySelectorAll<HTMLElement>('*'))
      .flatMap((element) => Array.from(element.classList));
    expect(classes).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^(?:bg|text|border)-(?:red|seal)(?:-|$)/),
      ]),
    );
  });
});
