import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { OrderStatus, type Locale } from '@app/shared';

import {
  inputClass,
  primaryButtonClass,
  secondaryLinkClass,
} from '@/components/admin/classes';
import { OrderStatusBadge } from '@/components/billing/order-status';
import { getAdminOrders, getBillingReport } from '@/lib/billing';
import { formatDate, formatDateTime } from '@/lib/format';
import { pick } from '@/lib/localized';
import { numberFormat } from '@/lib/numbers';
import {
  orderPages,
  ordersHref,
  parseOrdersPage,
  parseOrderStatus,
} from '@/lib/orders-paging';
import { formatEgp } from '@/lib/price';
import { requireUser } from '@/lib/protected-session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('adminOrders'), robots: { index: false, follow: false } };
}

export default async function AdminOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale, `/${locale}/admin/orders`, true);
  const raw = await searchParams;
  const qRaw = Array.isArray(raw.q) ? raw.q[0] : raw.q;
  const q = (qRaw ?? '').trim().slice(0, 200);
  const status = parseOrderStatus(raw.status);
  const page = parseOrdersPage(raw.page);
  const [t, result, report] = await Promise.all([
    getTranslations('Admin.orders'),
    getAdminOrders({ page, q, status }),
    getBillingReport(),
  ]);
  const pages = orderPages(result.total, result.pageSize);
  if (page > pages) redirect(ordersHref(locale, { q, status, page: pages }));
  const nf = numberFormat(locale);

  const anomalies = [
    {
      key: 'mismatches' as const,
      count: report.callbacksWithMismatches,
    },
    {
      key: 'unmatched' as const,
      count: report.callbacksWithoutMatchingOrder,
    },
    {
      key: 'missingEnrollment' as const,
      count: report.paidOrdersWithoutEnrollment,
      href: ordersHref(locale, { status: OrderStatus.PAID }),
    },
  ];

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-8 lg:py-20">
      <h1 className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
        {t('title')}
      </h1>
      <p className="mt-3 max-w-[40rem] text-lg leading-[1.8] text-cobalt">
        {t('intro')}
      </p>

      <section
        className="mt-10 rounded-2xl bg-glaze-shade p-5 sm:p-6"
        aria-labelledby="billing-report-heading"
      >
        <h2
          id="billing-report-heading"
          className="text-xl font-semibold text-deep"
        >
          {t('report.title')}
        </h2>
        <p className="mt-2 text-sm text-cobalt tabular">
          {t('report.since', { date: formatDateTime(report.since, locale) })}
        </p>
        <dl className="mt-5 grid gap-5 md:grid-cols-3">
          {anomalies.map((item) => (
            <div key={item.key}>
              <dt className="text-sm font-semibold text-deep">
                {t(`report.${item.key}.label`)}
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-deep tabular">
                {nf.format(item.count)}
              </dd>
              <dd className="mt-2 text-sm leading-relaxed text-cobalt">
                {t(`report.${item.key}.help`)}
              </dd>
              {item.href ? (
                <dd>
                  <Link
                    href={item.href}
                    className={`mt-2 ${secondaryLinkClass}`}
                  >
                    {t('report.viewPaid')}
                  </Link>
                </dd>
              ) : null}
            </div>
          ))}
        </dl>
      </section>

      <form
        role="search"
        method="get"
        action={`/${locale}/admin/orders`}
        className="mt-10 grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem_auto] md:items-end"
      >
        <div>
          <label
            htmlFor="orders-q"
            className="mb-2 block text-sm font-semibold text-deep"
          >
            {t('searchLabel')}
          </label>
          <input
            id="orders-q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={200}
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="orders-status"
            className="mb-2 block text-sm font-semibold text-deep"
          >
            {t('statusLabel')}
          </label>
          <select
            id="orders-status"
            name="status"
            defaultValue={status ?? ''}
            className={inputClass}
          >
            <option value="">{t('allStatuses')}</option>
            {Object.values(OrderStatus).map((value) => (
              <option key={value} value={value}>
                {t(`status.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={primaryButtonClass}>
          <Search aria-hidden="true" className="me-2 size-5" />
          {t('apply')}
        </button>
      </form>
      {q || status ? (
        <Link
          href={`/${locale}/admin/orders`}
          className={`mt-3 ${secondaryLinkClass}`}
        >
          {t('clear')}
        </Link>
      ) : null}

      <p
        role="status"
        className="mt-9 text-sm font-semibold text-cobalt tabular"
      >
        {t('results', { count: nf.format(result.total) })}
      </p>

      {result.orders.length === 0 ? (
        <p className="mt-4 rounded-2xl border-2 border-dashed border-unfired px-6 py-12 text-center text-lg text-unfired-ink">
          {t('empty')}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[58rem] border-t-2 border-cobalt text-start">
            <thead>
              <tr className="border-b border-wash text-sm text-cobalt">
                {(
                  [
                    'date',
                    'student',
                    'level',
                    'amount',
                    'orderStatus',
                    'paidAt',
                  ] as const
                ).map((key) => (
                  <th
                    key={key}
                    scope="col"
                    className="px-3 py-3 text-start font-semibold"
                  >
                    {t(`columns.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.orders.map((order) => (
                <tr key={order.id} className="border-b border-wash align-top">
                  <td className="px-3 py-4 text-sm text-cobalt tabular">
                    <Link
                      href={`/${locale}/admin/orders/${order.id}`}
                      className="font-semibold text-deep underline decoration-wash-strong underline-offset-4"
                    >
                      {formatDate(order.createdAt, locale)}
                    </Link>
                  </td>
                  <td className="px-3 py-4">
                    <Link
                      href={`/${locale}/admin/students/${order.user.id}`}
                      className="font-semibold text-deep underline decoration-wash-strong underline-offset-4"
                    >
                      {order.user.name}
                    </Link>
                    <span dir="ltr" className="mt-1 block text-sm text-cobalt">
                      {order.user.email}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-deep">
                    {pick(order.levelTitle, locale)}
                  </td>
                  <td className="px-3 py-4 font-semibold text-deep tabular">
                    {formatEgp(order.amountMinor, locale)}
                  </td>
                  <td className="px-3 py-4">
                    <OrderStatusBadge
                      status={order.status}
                      label={t(`status.${order.status}`)}
                    />
                  </td>
                  <td className="px-3 py-4 text-sm text-cobalt tabular">
                    {order.paidAt
                      ? formatDateTime(order.paidAt, locale)
                      : t('notPaid')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav
          aria-label={t('pagination')}
          className="mt-8 flex items-center justify-between gap-4"
        >
          {page > 1 ? (
            <Link
              rel="prev"
              href={ordersHref(locale, { q, status, page: page - 1 })}
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
          <p className="text-sm font-semibold text-deep tabular">
            {t('pageInfo', { page: nf.format(page), pages: nf.format(pages) })}
          </p>
          {page < pages ? (
            <Link
              rel="next"
              href={ordersHref(locale, { q, status, page: page + 1 })}
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
    </section>
  );
}
