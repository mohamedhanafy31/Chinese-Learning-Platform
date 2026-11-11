import { getTranslations } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { requireUser } from '@/lib/protected-session';

export default async function BackofficeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale: localeValue } = await params;
  const locale = localeValue as Locale;
  await requireUser(locale, `/${locale}/admin`, true);
  const t = await getTranslations({ locale, namespace: 'Admin.nav' });

  return (
    <div className="flex min-h-dvh flex-col bg-glaze">
      <SiteHeader
        locale={locale}
        tone="on-glaze"
        navLabel={t('label')}
        navItems={[
          { href: `/${locale}/admin/levels`, label: t('levels') },
          { href: `/${locale}/admin/students`, label: t('students') },
          { href: `/${locale}/admin/orders`, label: t('orders') },
          { href: `/${locale}/admin/audit`, label: t('audit') },
          {
            href: `/${locale}/admin/settings/diagnostics`,
            label: t('diagnostics'),
          },
        ]}
      />
      <main className="flex-1">{children}</main>
      <SiteFooter locale={locale} />
    </div>
  );
}
