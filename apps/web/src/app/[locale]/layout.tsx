import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';

import { RTL_LOCALES, type Locale } from '@app/shared';

import {
  MOTION_BOOT_SCRIPT,
  MotionObserver,
} from '@/components/motion/motion-observer';
import { routing } from '@/i18n/routing';

import '../globals.css';
import '../motion.css';
import { fontVariables } from '../fonts';

export const metadata: Metadata = {
  title: 'Mazen Chinese · 马赞中文',
  description: 'Chinese lessons for Arabic speakers, taught by Mazen.',
};

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps): Promise<React.JSX.Element> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  const direction = (RTL_LOCALES as readonly Locale[]).includes(locale)
    ? 'rtl'
    : 'ltr';

  return (
    <html
      lang={locale}
      dir={direction}
      className={fontVariables}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <MotionObserver />
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
