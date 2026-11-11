import type { AdminOverview, Locale } from '@app/shared';

import { numberFormat } from '@/lib/numbers';
import { formatEgp } from '@/lib/price';

export interface OverviewStat {
  id:
    | 'students'
    | 'newStudents'
    | 'enrollments'
    | 'purchases'
    | 'revenue'
    | 'pending'
    | 'callbacks';
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
    {
      id: 'enrollments',
      value: nf.format(overview.enrollments.active),
      href: null,
    },
    {
      id: 'purchases',
      value: nf.format(overview.enrollments.purchasedLast30d),
      href: `/${locale}/admin/orders`,
    },
    {
      id: 'revenue',
      value: formatEgp(overview.revenueLast30dMinor, locale),
      href: `/${locale}/admin/orders`,
    },
    {
      id: 'pending',
      value: nf.format(overview.pendingOrders),
      href: `/${locale}/admin/orders`,
    },
    {
      id: 'callbacks',
      value: nf.format(overview.failedCallbacksLast24h),
      href: `/${locale}/admin/settings/diagnostics`,
    },
  ];
}

/** Which honest warnings the overview shows. */
export function overviewWarnings(
  overview: AdminOverview,
): Array<'payments' | 'video'> {
  const warnings: Array<'payments' | 'video'> = [];
  if (!overview.payments.available) warnings.push('payments');
  if (overview.video.active === 'LOCAL') warnings.push('video');
  return warnings;
}
