import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import type { AuditEntry, Locale } from '@app/shared';

import {
  auditDetails,
  auditEntityHref,
  auditPhrase,
  type AuditTranslator,
} from '@/lib/audit-format';
import { formatDateTime } from '@/lib/format';

/**
 * A ruled list of audit entries: when, who, a readable phrase that links to
 * the entity, and a disclosure with the fields that changed.
 */
export async function AuditList({
  entries,
  label,
  locale,
}: {
  entries: AuditEntry[];
  label: string;
  locale: Locale;
}): Promise<React.JSX.Element> {
  const t = (await getTranslations({
    locale,
    namespace: 'Audit',
  })) as unknown as AuditTranslator;

  return (
    <ol
      aria-label={label}
      data-testid="audit-list"
      className="border-t-2 border-cobalt"
    >
      {entries.map((entry) => {
        const href = auditEntityHref(entry, locale);
        const phrase = auditPhrase(t, entry, locale);
        const details = auditDetails(entry, locale, t('yes'), t('no'));
        const reason =
          typeof entry.data.reason === 'string' && entry.data.reason
            ? entry.data.reason
            : null;
        return (
          <li
            key={entry.id}
            data-audit-action={entry.action}
            className="border-b border-wash py-4 sm:px-2"
          >
            <p className="text-sm tabular text-cobalt">
              {formatDateTime(entry.createdAt, locale)}
              {' · '}
              <span>{t('by', { name: entry.actor.name })}</span>
            </p>
            <p className="mt-1 text-lg font-semibold leading-snug text-deep">
              {href ? (
                <Link
                  href={href}
                  className="underline decoration-wash-strong underline-offset-4 hover:decoration-deep"
                >
                  {phrase}
                </Link>
              ) : (
                phrase
              )}
            </p>
            {details.length > 0 || reason ? (
              <details className="mt-2 text-cobalt">
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-cobalt hover:text-deep">
                  {t('details')}
                </summary>
                <dl className="mt-1 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
                  {details.map((detail) => (
                    <div key={detail.field} className="contents">
                      <dt className="font-semibold text-deep">
                        {t.has(`fields.${detail.field}`)
                          ? t(`fields.${detail.field}`)
                          : detail.field}
                      </dt>
                      <dd className="break-words">
                        {detail.from === null
                          ? t('changedOnly')
                          : t('fromTo', {
                              from: detail.from,
                              to: detail.to ?? '—',
                            })}
                      </dd>
                    </div>
                  ))}
                  {reason ? (
                    <div className="contents">
                      <dt className="font-semibold text-deep">
                        {t('fields.reason')}
                      </dt>
                      <dd className="break-words">{reason}</dd>
                    </div>
                  ) : null}
                </dl>
              </details>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
