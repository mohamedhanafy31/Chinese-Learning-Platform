import type { Locale } from '@app/shared';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { requireUser } from '@/lib/protected-session';

export default async function LearnerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale: localeValue } = await params;
  const locale = localeValue as Locale;
  await requireUser(locale, `/${locale}/dashboard`);

  return (
    <div className="flex min-h-dvh flex-col bg-glaze">
      <SiteHeader locale={locale} tone="on-glaze" />
      <main className="flex-1">{children}</main>
      <SiteFooter locale={locale} />
    </div>
  );
}
