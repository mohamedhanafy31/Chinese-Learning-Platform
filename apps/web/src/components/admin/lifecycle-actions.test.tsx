import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LifecycleActions } from '@/components/admin/lifecycle-actions';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/ar/admin/levels/level-id',
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe('LifecycleActions', () => {
  afterEach(cleanup);

  it.each([
    ['published', true, null],
    ['archived', false, '2026-11-12T00:00:00.000Z'],
  ] as const)(
    'always offers permanent deletion for %s content',
    (_, isPublished, archivedAt) => {
      render(
        <LifecycleActions
          kind="level"
          id="level-id"
          title="Level title"
          locale="ar"
          isPublished={isPublished}
          archivedAt={archivedAt}
          afterDeleteHref="/ar/admin/levels"
          checklist={{
            required: { met: true, label: 'required item' },
            recommended: [
              { met: false, label: 'recommended one' },
              { met: false, label: 'recommended two' },
            ],
          }}
        />,
      );

      expect(screen.getByRole('button', { name: 'delete' })).toBeTruthy();
    },
  );

  it('disables publish and describes it with the missing required item', () => {
    render(
      <LifecycleActions
        kind="lesson"
        id="lesson-id"
        title="Lesson title"
        locale="en"
        isPublished={false}
        archivedAt={null}
        afterDeleteHref="/en/admin/levels/level-id"
        checklist={{
          required: { met: false, label: 'content required' },
          recommended: [
            { met: false, label: 'description' },
            { met: false, label: 'thumbnail' },
          ],
        }}
      />,
    );

    const publish = screen.getByRole('button', { name: 'publish' });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAttribute(
      'aria-describedby',
      'lesson-lesson-id-publish-checklist',
    );
    expect(screen.getByText('content required')).toBeVisible();
    expect(screen.getByText('publishBlocked')).toBeVisible();
  });
});
