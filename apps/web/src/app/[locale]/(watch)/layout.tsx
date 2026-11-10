import type { Locale } from '@app/shared';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

/**
 * Lesson pages are public (free previews need no account), so there is no
 * `requireUser` here: the API decides what each viewer may watch.
 */
export default async function WatchLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;

  return (
    <div className="flex min-h-dvh flex-col bg-glaze">
      <SiteHeader locale={locale as Locale} tone="on-glaze" />
      <main className="flex-1">{children}</main>
      <SiteFooter locale={locale as Locale} />
    </div>
  );
}
