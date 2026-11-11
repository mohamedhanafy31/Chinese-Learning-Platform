import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { secondaryLinkClass } from '@/components/admin/classes';
import { TransactionFlags } from '@/components/admin/transaction-flags';
import { OrderStatusBadge } from '@/components/billing/order-status';
import { getAdminOrder } from '@/lib/billing';
import { formatDateTime } from '@/lib/format';
import { pick } from '@/lib/localized';
import { paymentCard } from '@/lib/payment-card';
import { formatEgp } from '@/lib/price';
import { requireUser } from '@/lib/protected-session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('adminOrder'),
    robots: { index: false, follow: false },
  };
}

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireUser(locale, `/${locale}/admin/orders/${id}`, true);
  const [t, order] = await Promise.all([
    getTranslations('Admin.order'),
    getAdminOrder(id),
  ]);
  const levelTitle = pick(order.levelTitle, locale);

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-8 lg:py-20">
      <Link href={`/${locale}/admin/orders`} className={secondaryLinkClass}>
        {t('back')}
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <h1 className="font-display text-balance text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
          {t('titlePrefix')} <bdi>{levelTitle}</bdi>
        </h1>
        <OrderStatusBadge
          status={order.status}
          label={t(`status.${order.status}`)}
        />
      </div>

      <dl className="mt-8 grid gap-x-8 gap-y-4 text-cobalt sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-sm font-semibold text-deep">{t('student')}</dt>
        <dd>
          <Link
            href={`/${locale}/admin/students/${order.user.id}`}
            className="font-semibold text-deep underline decoration-wash-strong underline-offset-4"
          >
            {order.user.name}
          </Link>
          <span dir="ltr" className="ms-2 inline-block text-sm">
            {order.user.email}
          </span>
        </dd>
        <dt className="text-sm font-semibold text-deep">{t('level')}</dt>
        <dd>
          <Link
            href={`/${locale}/admin/levels/${order.levelId}`}
            className="font-semibold text-deep underline decoration-wash-strong underline-offset-4"
          >
            {levelTitle}
          </Link>
        </dd>
        <dt className="text-sm font-semibold text-deep">{t('amount')}</dt>
        <dd className="font-semibold tabular">
          {formatEgp(order.amountMinor, locale)}
        </dd>
        <dt className="text-sm font-semibold text-deep">{t('created')}</dt>
        <dd className="tabular">{formatDateTime(order.createdAt, locale)}</dd>
        <dt className="text-sm font-semibold text-deep">{t('paidAt')}</dt>
        <dd className="tabular">
          {order.paidAt ? formatDateTime(order.paidAt, locale) : t('notPaid')}
        </dd>
        <dt className="text-sm font-semibold text-deep">{t('expires')}</dt>
        <dd className="tabular">{formatDateTime(order.expiresAt, locale)}</dd>
        <dt className="text-sm font-semibold text-deep">{t('reference')}</dt>
        <dd dir="ltr" className="break-all tabular">
          {order.specialReference}
        </dd>
        <dt className="text-sm font-semibold text-deep">{t('intention')}</dt>
        <dd dir="ltr" className="break-all tabular">
          {order.paymobIntentionId ?? t('notAvailable')}
        </dd>
        <dt className="text-sm font-semibold text-deep">
          {t('providerOrder')}
        </dt>
        <dd dir="ltr" className="break-all tabular">
          {order.paymobOrderId ?? t('notAvailable')}
        </dd>
      </dl>

      <h2 className="mt-14 text-xl font-semibold text-deep">
        {t('transactionsTitle')}
      </h2>
      {order.transactions.length === 0 ? (
        <p className="mt-4 rounded-2xl border-2 border-dashed border-unfired px-6 py-10 text-center text-lg text-unfired-ink">
          {t('transactionsEmpty')}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[64rem] border-t-2 border-cobalt text-start">
            <thead>
              <tr className="border-b border-wash text-sm text-cobalt">
                {(
                  [
                    'time',
                    'transactionId',
                    'integration',
                    'flags',
                    'transactionAmount',
                    'card',
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
              {order.transactions.map((transaction) => {
                const card = paymentCard(transaction.payloadRedacted);
                return (
                  <tr
                    key={transaction.id}
                    className="border-b border-wash align-top"
                  >
                    <td className="px-3 py-4 text-sm text-cobalt tabular">
                      {formatDateTime(transaction.occurredAt, locale)}
                    </td>
                    <td
                      dir="ltr"
                      className="max-w-56 break-all px-3 py-4 text-sm text-deep tabular"
                    >
                      {transaction.providerTransactionId}
                    </td>
                    <td
                      dir="ltr"
                      className="px-3 py-4 text-sm text-deep tabular"
                    >
                      {transaction.integrationId}
                    </td>
                    <td className="px-3 py-4">
                      <TransactionFlags
                        transaction={transaction}
                        labels={{
                          success: t('flags.success'),
                          pending: t('flags.pending'),
                          refund: t('flags.refund'),
                          voided: t('flags.voided'),
                          yes: t('flags.yes'),
                          no: t('flags.no'),
                        }}
                      />
                    </td>
                    <td className="px-3 py-4 font-semibold text-deep tabular">
                      {formatEgp(transaction.amountMinor, locale)}
                    </td>
                    <td className="px-3 py-4 text-sm text-cobalt">
                      {card.brand || card.last4
                        ? t('cardDetails', {
                            brand: card.brand ?? t('unknownCard'),
                            last4: card.last4 ?? t('unknownLast4'),
                          })
                        : t('notAvailable')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
