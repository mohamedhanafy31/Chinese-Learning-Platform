import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import type { AuditEntry, Locale } from '@app/shared';

import { AuditList } from '@/components/admin/audit-list';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/ui/notice';
import { auditHref } from '@/lib/audit-format';

/**
 * "History" on an entity's admin page: its last ten audit entries and a link
 * to the full, filtered log. `entries` is null when they could not be read,
 * which shows an honest notice instead of breaking the page.
 */
export async function AuditHistory({
  entries,
  entity,
  entityId,
  locale,
}: {
  entries: AuditEntry[] | null;
  entity: string;
  entityId: string;
  locale: Locale;
}): Promise<React.JSX.Element> {
  const t = await getTranslations({ locale, namespace: 'Audit' });
  return (
    <section aria-labelledby={`history-${entityId}`} className="mt-16">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2
          id={`history-${entityId}`}
          className="text-xl font-semibold text-deep"
        >
          {t('historyTitle')}
        </h2>
        <Link
          href={auditHref(locale, { entity, entityId })}
          className="inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-8 hover:text-deep"
        >
          {t('fullLog')}
        </Link>
      </div>
      <div className="mt-4">
        {entries === null ? (
          <Notice>{t('historyError')}</Notice>
        ) : entries.length === 0 ? (
          <EmptyState body={t('historyEmpty')} />
        ) : (
          <AuditList
            entries={entries}
            label={t('historyLabel')}
            locale={locale}
          />
        )}
      </div>
    </section>
  );
}
