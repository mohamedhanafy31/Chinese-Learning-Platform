'use client';

import { useTranslations } from 'next-intl';

export function RefundedAccessBadge(): React.JSX.Element {
  const t = useTranslations('Admin.orders');
  return (
    <span className="mt-2 block text-xs font-semibold text-deep">
      {t('accessStillActive')}
    </span>
  );
}
