import { describe, expect, it } from 'vitest';

import type { AdminOverview } from '@app/shared';

import { overviewStats } from './overview-format';

const overview: AdminOverview = {
  students: { total: 1234, newLast30d: 56 },
  enrollments: { active: 789, purchasedLast30d: 12 },
  revenueLast30dMinor: 15_505_000,
  pendingOrders: 3,
  failedCallbacksLast24h: 0,
  video: { active: 'BUNNY', devOnly: false },
  payments: { available: true },
};

const byId = (locale: 'ar' | 'en' | 'zh') =>
  Object.fromEntries(
    overviewStats(overview, locale).map((stat) => [stat.id, stat.value]),
  );

describe('overviewStats', () => {
  it('uses Eastern Arabic digits in Arabic', () => {
    const stats = byId('ar');
    expect(stats.students).toBe('١٬٢٣٤');
  });

  it('uses Western digits in English and Chinese', () => {
    expect(byId('en').students).toBe('1,234');
    expect(byId('zh').newStudents).toBe('56');
  });

  it('shows only learner numbers now that levels are free', () => {
    expect(overviewStats(overview, 'en').map((stat) => stat.id)).toEqual([
      'students',
      'newStudents',
    ]);
  });

  it('links the stats to the page that explains them', () => {
    const stats = overviewStats(overview, 'en');
    expect(stats.find((s) => s.id === 'students')!.href).toBe(
      '/en/admin/students',
    );
  });
});
