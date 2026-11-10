import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { SessionRenewal } from '@/components/auth/session-renewal';
import { Seal } from '@/components/porcelain/seal';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('renew'), robots: { index: false, follow: false } };
}

export default async function RenewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ next?: string | string[] }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const next = typeof query.next === 'string' ? query.next : undefined;
  const t = await getTranslations('Session');

  return (
    <main className="grid min-h-dvh place-items-center bg-glaze px-4 text-center">
      <div>
        <Seal size={88} />
        <p className="mt-6 text-lg text-cobalt" aria-live="polite">
          {t('renewing')}
        </p>
        <SessionRenewal locale={locale} next={next} />
      </div>
    </main>
  );
}
