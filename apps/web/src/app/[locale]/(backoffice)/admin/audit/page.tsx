import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AuditEntity, type AdminAuditResponse, type Locale } from '@app/shared';

import { AuditList } from '@/components/admin/audit-list';
import {
  inputClass,
  primaryButtonClass,
  secondaryLinkClass,
} from '@/components/admin/classes';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/ui/notice';
import { getAdminAudit } from '@/lib/admin-api';
import { auditHref, type AuditFilters } from '@/lib/audit-format';
import { numberFormat } from '@/lib/numbers';
import { requireUser } from '@/lib/protected-session';
import { parsePage, totalPages } from '@/lib/students-paging';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('adminAudit'), robots: { index: false, follow: false } };
}

const first = (value: string | string[] | undefined): string =>
  ((Array.isArray(value) ? value[0] : value) ?? '').trim().slice(0, 200);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const ACTION_CODES = [
  'level.create',
  'level.update',
  'level.publish',
  'level.unpublish',
  'level.archive',
  'level.unarchive',
  'level.delete',
  'level.reorder',
  'lesson.create',
  'lesson.update',
  'lesson.free_preview',
  'lesson.publish',
  'lesson.unpublish',
  'lesson.archive',
  'lesson.unarchive',
  'lesson.delete',
  'lesson.reorder',
  'image.upload',
  'video.upload_local',
  'video.upload_bunny',
  'video.remove',
  'quiz.create',
  'quiz.update',
  'quiz.archive',
  'quiz.restore',
  'quiz.delete',
  'quiz.reorder',
  'question.create',
  'question.update',
  'question.delete',
  'question.reorder',
  'enrollment.grant',
  'enrollment.revoke',
  'enrollment.reactivate',
  'student.deactivate',
  'student.reactivate',
];

export default async function AdminAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale, `/${locale}/admin/audit`, true);
  const t = await getTranslations('Admin.audit');
  const tEntity = await getTranslations('Audit.entities');
  const nf = numberFormat(locale);

  const raw = await searchParams;
  const from = first(raw.from);
  const to = first(raw.to);
  const filters: AuditFilters = {
    entity: first(raw.entity),
    entityId: first(raw.entityId),
    actor: first(raw.actor),
    action: first(raw.action),
    from: DATE.test(from) ? from : '',
    to: DATE.test(to) ? to : '',
  };
  const page = parsePage(raw.page);

  let result: AdminAuditResponse | null;
  try {
    result = await getAdminAudit({ ...filters, page });
  } catch {
    result = null;
  }
  const pages = result ? totalPages(result.total, result.pageSize) : 1;
  if (result && page > pages) redirect(auditHref(locale, filters, pages));
  const filtered = Object.values(filters).some(Boolean);

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-8 lg:py-20">
      <h1 className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
        {t('title')}
      </h1>
      <p className="mt-3 max-w-[34rem] text-lg leading-[1.8] text-cobalt">
        {t('intro')}
      </p>

      <form
        role="search"
        method="get"
        action={`/${locale}/admin/audit`}
        className="mt-10 grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {filters.entityId ? (
          <input type="hidden" name="entityId" value={filters.entityId} />
        ) : null}
        <div>
          <label
            htmlFor="audit-entity"
            className="mb-2 block text-sm font-semibold text-deep"
          >
            {t('entity')}
          </label>
          <select
            id="audit-entity"
            name="entity"
            defaultValue={filters.entity}
            className={inputClass}
          >
            <option value="">{t('anyEntity')}</option>
            {Object.values(AuditEntity).map((entity) => (
              <option key={entity} value={entity}>
                {tEntity(entity)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="audit-action"
            className="mb-2 block text-sm font-semibold text-deep"
          >
            {t('action')}
          </label>
          <input
            id="audit-action"
            name="action"
            type="text"
            list="audit-actions"
            dir="ltr"
            defaultValue={filters.action}
            maxLength={200}
            autoComplete="off"
            aria-describedby="audit-action-helper"
            className={inputClass}
          />
          <datalist id="audit-actions">
            {ACTION_CODES.map((code) => (
              <option key={code} value={code} />
            ))}
          </datalist>
          <p id="audit-action-helper" className="mt-2 text-sm text-cobalt">
            {t('actionHelper')}
          </p>
        </div>
        <div>
          <label
            htmlFor="audit-actor"
            className="mb-2 block text-sm font-semibold text-deep"
          >
            {t('actor')}
          </label>
          <input
            id="audit-actor"
            name="actor"
            type="search"
            defaultValue={filters.actor}
            maxLength={200}
            autoComplete="off"
            aria-describedby="audit-actor-helper"
            className={inputClass}
          />
          <p id="audit-actor-helper" className="mt-2 text-sm text-cobalt">
            {t('actorHelper')}
          </p>
        </div>
        <div>
          <label
            htmlFor="audit-from"
            className="mb-2 block text-sm font-semibold text-deep"
          >
            {t('from')}
          </label>
          <input
            id="audit-from"
            name="from"
            type="date"
            defaultValue={filters.from}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="audit-to"
            className="mb-2 block text-sm font-semibold text-deep"
          >
            {t('to')}
          </label>
          <input
            id="audit-to"
            name="to"
            type="date"
            defaultValue={filters.to}
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <button type="submit" className={primaryButtonClass}>
            <Search aria-hidden="true" className="me-2 size-5" />
            {t('submit')}
          </button>
          {filtered ? (
            <Link
              href={`/${locale}/admin/audit`}
              className={secondaryLinkClass}
            >
              {t('clear')}
            </Link>
          ) : null}
        </div>
      </form>

      {result === null ? (
        <div className="mt-10">
          <Notice role="alert">{t('loadError')}</Notice>
        </div>
      ) : (
        <>
          <p
            role="status"
            className="mt-10 text-sm font-semibold tabular text-cobalt"
          >
            {t('results', { count: nf.format(result.total) })}
          </p>
          <div className="mt-4">
            {result.entries.length === 0 ? (
              <EmptyState
                body={filtered ? t('emptyFiltered') : t('empty')}
                action={
                  filtered
                    ? { href: `/${locale}/admin/audit`, label: t('clear') }
                    : {
                        href: `/${locale}/admin/levels`,
                        label: t('emptyAction'),
                      }
                }
              />
            ) : (
              <AuditList
                entries={result.entries}
                label={t('listLabel')}
                locale={locale}
              />
            )}
          </div>
          {pages > 1 ? (
            <nav
              aria-label={t('pagination')}
              className="mt-8 flex flex-wrap items-center justify-between gap-4"
            >
              {page > 1 ? (
                <Link
                  rel="prev"
                  href={auditHref(locale, filters, page - 1)}
                  className={secondaryLinkClass}
                >
                  <ChevronLeft
                    aria-hidden="true"
                    className="me-1 size-5 rtl:-scale-x-100"
                  />
                  {t('previous')}
                </Link>
              ) : (
                <span aria-hidden="true" />
              )}
              <p className="text-sm font-semibold tabular text-deep">
                {t('pageInfo', {
                  page: nf.format(page),
                  pages: nf.format(pages),
                })}
              </p>
              {page < pages ? (
                <Link
                  rel="next"
                  href={auditHref(locale, filters, page + 1)}
                  className={secondaryLinkClass}
                >
                  {t('next')}
                  <ChevronRight
                    aria-hidden="true"
                    className="ms-1 size-5 rtl:-scale-x-100"
                  />
                </Link>
              ) : (
                <span aria-hidden="true" />
              )}
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
