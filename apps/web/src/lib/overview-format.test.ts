import { describe, expect, it } from 'vitest';

import type { AdminOverview } from '@app/shared';

import { overviewStats, overviewWarnings } from './overview-format';

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
  it('uses Eastern Arabic digits in Arabic and EGP from integer piasters', () => {
    const stats = byId('ar');
    expect(stats.students).toBe('١٬٢٣٤');
    expect(stats.pending).toBe('٣');
    expect(stats.revenue).toMatch(/^[\s\S]*[٠-٩]/);
    expect(stats.revenue).not.toMatch(/[0-9]/);
    expect(stats.revenue).toContain('١٥٥٬٠٥٠');
  });

  it('uses Western digits in English and Chinese', () => {
    expect(byId('en').students).toBe('1,234');
    expect(byId('en').revenue).toContain('155,050');
    expect(byId('zh').newStudents).toBe('56');
  });

  it('shows the cents when the revenue has piasters', () => {
    const stats = overviewStats(
      { ...overview, revenueLast30dMinor: 15_050 },
      'en',
    );
    expect(stats.find((s) => s.id === 'revenue')!.value).toContain('150.50');
  });

  it('links the stats to the page that explains them', () => {
    const stats = overviewStats(overview, 'en');
    expect(stats.find((s) => s.id === 'pending')!.href).toBe(
      '/en/admin/orders',
    );
    expect(stats.find((s) => s.id === 'callbacks')!.href).toBe(
      '/en/admin/settings/diagnostics',
    );
    expect(stats.find((s) => s.id === 'enrollments')!.href).toBeNull();
  });
});

describe('overviewWarnings', () => {
  it('is quiet when payments and Bunny are ready', () => {
    expect(overviewWarnings(overview)).toEqual([]);
  });

  it('warns about missing payments and about local video', () => {
    expect(
      overviewWarnings({
        ...overview,
        payments: { available: false },
        video: { active: 'LOCAL', devOnly: false },
      }),
    ).toEqual(['payments', 'video']);
  });
});
