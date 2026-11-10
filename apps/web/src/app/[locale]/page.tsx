import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { apiServerFetch } from '@/lib/api-server';

async function isApiHealthy(): Promise<boolean> {
  try {
    const response = await apiServerFetch('/api/v1/health');
    return response.ok;
  } catch {
    return false;
  }
}

interface HomePageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function HomePage({
  params,
}: HomePageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Home');
  const healthy = await isApiHealthy();

  return (
    <main className="p-4">
      <h1>{t('appName')}</h1>
      <p>{t('placeholder')}</p>
      <LocaleSwitcher currentLocale={locale} label={t('languageSwitcher')} />
      <p role="status">
        {t('apiStatus')}: {healthy ? t('apiOnline') : t('apiOffline')}
      </p>
    </main>
  );
}
