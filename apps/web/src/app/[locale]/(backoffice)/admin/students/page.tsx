import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleSlash,
  Search,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import {
  inputClass,
  primaryButtonClass,
  secondaryLinkClass,
} from '@/components/admin/classes';
import { getAdminStudents } from '@/lib/admin-api';
import { formatDate } from '@/lib/format';
import { numberFormat } from '@/lib/numbers';
import { requireUser } from '@/lib/protected-session';
import { parsePage, studentsHref, totalPages } from '@/lib/students-paging';
import { EmptyState } from '@/components/ui/empty-state';
import { Notice } from '@/components/ui/notice';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('adminStudents'), robots: { index: false, follow: false } };
}

export default async function AdminStudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale, `/${locale}/admin/students`, true);
  const t = await getTranslations('Admin.students');
  const nf = numberFormat(locale);

  const raw = await searchParams;
  const queryParam = Array.isArray(raw.query) ? raw.query[0] : raw.query;
  const query = (queryParam ?? '').trim().slice(0, 200);
  const page = parsePage(raw.page);
  const result = await getAdminStudents({ query, page }).catch(() => null);
  const pages = result ? totalPages(result.total, result.pageSize) : 1;
  if (result && page > pages) redirect(studentsHref(locale, query, pages));

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
        action={`/${locale}/admin/students`}
        className="mt-10 max-w-[40rem]"
      >
        <label
          htmlFor="students-query"
          className="mb-2 block text-sm font-semibold text-deep"
        >
          {t('searchLabel')}
        </label>
        <div className="flex flex-wrap items-start gap-3">
          <input
            id="students-query"
            name="query"
            type="search"
            defaultValue={query}
            maxLength={200}
            autoComplete="off"
            aria-describedby="students-query-helper"
            className={`${inputClass} min-w-0 flex-1 basis-64`}
          />
          <button type="submit" className={primaryButtonClass}>
            <Search aria-hidden="true" className="me-2 size-5" />
            {t('searchSubmit')}
          </button>
        </div>
        <p id="students-query-helper" className="mt-2 text-sm text-cobalt">
          {t('searchHelper')}
        </p>
        {query ? (
          <Link
            href={`/${locale}/admin/students`}
            className={`mt-2 ${secondaryLinkClass}`}
          >
            {t('searchClear')}
          </Link>
        ) : null}
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
            {query
              ? t('resultsFor', { count: nf.format(result.total), query })
              : t('results', { count: nf.format(result.total) })}
          </p>

          {result.students.length === 0 ? (
            <EmptyState
              className="mt-4"
              body={query ? t('emptySearch') : t('empty')}
              action={
                query
                  ? {
                      href: `/${locale}/admin/students`,
                      label: t('searchClear'),
                    }
                  : { href: `/${locale}/admin/levels`, label: t('emptyAction') }
              }
            />
          ) : (
            <ul
              aria-label={t('listLabel')}
              className="mt-4 border-t-2 border-cobalt"
            >
              {result.students.map((student) => (
                <li key={student.id} className="border-b border-wash">
                  <div className="grid items-center gap-x-6 gap-y-2 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-2">
                    <div className="min-w-0">
                      <Link
                        href={`/${locale}/admin/students/${student.id}`}
                        className="text-xl font-semibold text-deep underline decoration-wash-strong underline-offset-4 hover:decoration-deep"
                      >
                        {student.name}
                      </Link>
                      <p className="mt-1 break-words text-cobalt">
                        <span dir="ltr" className="inline-block">
                          {student.email}
                        </span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-cobalt">
                        <span dir="ltr" className="tabular">
                          {student.phone}
                        </span>
                        <span className="tabular">
                          {t('joined', {
                            date: formatDate(student.createdAt, locale),
                          })}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      {student.isActive ? (
                        <span
                          data-testid="active-badge"
                          className="inline-flex items-center gap-1.5 rounded-full bg-deep px-3 py-1 text-sm font-semibold text-glaze"
                        >
                          <CircleCheck
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                          {t('accountActive')}
                        </span>
                      ) : (
                        <span
                          data-testid="deactivated-badge"
                          className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-unfired px-3 py-1 text-sm font-semibold text-unfired-ink"
                        >
                          <CircleSlash
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                          {t('deactivated')}
                        </span>
                      )}
                      <p className="text-sm font-semibold tabular text-deep">
                        {t('activeCount', {
                          count: nf.format(student.activeEnrollments),
                        })}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {pages > 1 ? (
            <nav
              aria-label={t('pagination')}
              className="mt-8 flex flex-wrap items-center justify-between gap-4"
            >
              {page > 1 ? (
                <Link
                  rel="prev"
                  href={studentsHref(locale, query, page - 1)}
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
                  href={studentsHref(locale, query, page + 1)}
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
