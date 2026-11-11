import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProgressBar } from './progress-bar';

const labels = {
  bar: 'Progress in this level',
  done: 'Completed',
  next: 'Up next',
  locked: 'Locked',
  preview: 'Free',
  open: 'Open',
};

describe('ProgressBar', () => {
  afterEach(cleanup);

  it('draws one segment per lesson with the DESIGN.md look per state', () => {
    render(
      <ProgressBar
        labels={labels}
        segments={[
          { id: 'a', state: 'done' },
          { id: 'b', state: 'next' },
          { id: 'c', state: 'preview' },
          { id: 'd', state: 'locked' },
        ]}
      />,
    );
    const items = within(
      screen.getByRole('list', { name: 'Progress in this level' }),
    ).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items.map((item) => item.dataset.state)).toEqual([
      'done',
      'next',
      'preview',
      'locked',
    ]);
    expect(items[0]?.className).toContain('bg-deep');
    expect(items[1]?.className).toContain('bg-seal');
    expect(items[2]?.className).toContain('bg-cobalt-mid');
    expect(items[3]?.className).toContain('border-dashed');
    expect(items[3]?.className).toContain('border-unfired');
  });

  it('names every state for screen readers, so colour is never the only signal', () => {
    render(
      <ProgressBar
        labels={labels}
        segments={[
          { id: 'a', state: 'done' },
          { id: 'b', state: 'next' },
          { id: 'd', state: 'locked' },
        ]}
      />,
    );
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Up next')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('uses the seal for the next segment only', () => {
    const { container } = render(
      <ProgressBar
        labels={labels}
        segments={[
          { id: 'a', state: 'done' },
          { id: 'b', state: 'next' },
          { id: 'c', state: 'locked' },
        ]}
      />,
    );
    expect(container.querySelectorAll('.bg-seal')).toHaveLength(1);
  });
});
