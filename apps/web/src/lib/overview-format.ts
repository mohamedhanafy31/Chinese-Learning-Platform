import type { AdminOverview, Locale } from '@app/shared';

import { numberFormat } from '@/lib/numbers';

export interface OverviewStat {
  id: 'students' | 'newStudents';
  value: string;
  /** Opens the page that explains the number, when there is one. */
  href: string | null;
}

/** The overview's stat blocks, numbers already in the reader's digits. */
export function overviewStats(
  overview: AdminOverview,
  locale: Locale,
): OverviewStat[] {
  const nf = numberFormat(locale);
  return [
    {
      id: 'students',
      value: nf.format(overview.students.total),
      href: `/${locale}/admin/students`,
    },
    {
      id: 'newStudents',
      value: nf.format(overview.students.newLast30d),
      href: `/${locale}/admin/students`,
    },
  ];
}
