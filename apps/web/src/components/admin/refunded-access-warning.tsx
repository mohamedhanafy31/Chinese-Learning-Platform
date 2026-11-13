'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { Locale } from '@app/shared';

import { Notice } from '@/components/ui/notice';

export function RefundedAccessWarning({
  locale,
  count,
}: {
  locale: Locale;
  count: number;
}): React.JSX.Element | null {
  const t = useTranslations('Admin.overview.warnings.refundedAccess');
  if (count <= 0) return null;
  return (
    <Notice title={t('title')}>
      {t('body')}{' '}
      <Link
        href={`/${locale}/admin/orders?refundedWithAccess=true`}
        className="underline underline-offset-4"
      >
        {t('link')}
      </Link>
    </Notice>
  );
}
