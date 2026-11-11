import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { ResultStatus } from '@/components/billing/result-status';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { OrderStatus } from '@app/shared';

import { getOrder } from '@/lib/billing';
import { getMyLevels } from '@/lib/learning';
import { getCurrentUser } from '@/lib/session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('checkoutResult'),
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const raw = await searchParams;
  const orderId = Array.isArray(raw.order) ? raw.order[0] : raw.order;
  if (!orderId) notFound();

  const next = `/${locale}/checkout/result?${new URLSearchParams({ order: orderId })}`;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/${locale}/login?${new URLSearchParams({ next })}`);
  }
  const order = await getOrder(orderId);
  // A paid order starts at the level's next lesson, not at its page.
  let startHref: string | null = null;
  if (order.status === OrderStatus.PAID) {
    const mine = await getMyLevels();
    const next =
      mine.status === 'ok'
        ? mine.levels.find((level) => level.slug === order.levelSlug)?.progress
            .nextLessonId
        : null;
    if (next) startHref = `/${locale}/learn/${order.levelSlug}/${next}`;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-glaze">
      <SiteHeader locale={locale} tone="on-glaze" />
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-20 sm:px-8 lg:py-24">
        <ResultStatus
          initialOrder={order}
          initialStartHref={startHref}
          locale={locale}
        />
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
