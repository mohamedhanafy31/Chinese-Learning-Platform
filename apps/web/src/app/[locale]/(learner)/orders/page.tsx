import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { OrderStatus, type Locale } from '@app/shared';

import { OrderStatusBadge } from '@/components/billing/order-status';
import { getOwnOrders } from '@/lib/billing';
import { formatDate } from '@/lib/format';
import { pick } from '@/lib/localized';
import { formatEgp } from '@/lib/price';
import { requireUser } from '@/lib/protected-session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('orders'), robots: { index: false, follow: false } };
}

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale, `/${locale}/orders`);
  const [t, orders] = await Promise.all([
    getTranslations('Billing.orders'),
    getOwnOrders(),
  ]);

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-20 sm:px-8 lg:py-24">
      <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-deep">
        {t('title')}
      </h1>
      <p className="mt-4 max-w-[40rem] text-lg leading-[1.8] text-cobalt">
        {t('intro')}
      </p>

      {orders.length === 0 ? (
        <div className="mt-10 rounded-2xl border-2 border-dashed border-unfired px-6 py-14 text-center">
          <p className="text-lg text-unfired-ink">{t('empty')}</p>
          <Link
            href={`/${locale}#levels`}
            className="mt-5 inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-8 hover:text-deep"
          >
            {t('browse')}
          </Link>
        </div>
      ) : (
        <ul
          aria-label={t('listLabel')}
          className="mt-10 border-t-2 border-cobalt"
        >
          {orders.map((order) => {
            const content = (
              <div className="grid gap-x-6 gap-y-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-2">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-deep">
                    {pick(order.levelTitle, locale)}
                  </h2>
                  <p className="mt-1 text-sm text-cobalt tabular">
                    {formatDate(order.createdAt, locale)}
                  </p>
                </div>
                <p className="font-semibold text-deep tabular">
                  {formatEgp(order.amountMinor, locale)}
                </p>
                <OrderStatusBadge
                  status={order.status}
                  label={t(`status.${order.status}`)}
                />
              </div>
            );
            return (
              <li key={order.id} className="border-b border-wash">
                {order.status === OrderStatus.PENDING ? (
                  <Link
                    href={`/${locale}/checkout/result?${new URLSearchParams({ order: order.id })}`}
                    aria-label={t('openPending', {
                      level: pick(order.levelTitle, locale),
                    })}
                    className="block rounded-2xl transition-colors hover:bg-glaze-bright"
                  >
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
