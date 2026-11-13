import { useTranslations } from 'next-intl';

import { Notice } from '@/components/ui/notice';

export function PendingVideoDeleteNotice({
  count,
}: {
  count: number;
}): React.JSX.Element | null {
  const t = useTranslations('Admin.diagnostics.pendingDeletesWarning');
  if (count <= 0) return null;
  return (
    <Notice role="alert" title={t('title')}>
      {t('body', { count })}
    </Notice>
  );
}
