import type { Locale } from '@app/shared';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale: localeValue } = await params;
  const locale = localeValue as Locale;

  return (
    <div className="flex min-h-dvh flex-col bg-glaze">
      <SiteHeader locale={locale} tone="on-glaze" />
      <main className="flex flex-1">{children}</main>
      <SiteFooter locale={locale} />
    </div>
  );
}
