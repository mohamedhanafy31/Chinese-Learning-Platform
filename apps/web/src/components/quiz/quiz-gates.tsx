import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import type { Locale } from '@app/shared';

import {
  primaryButtonClass,
  secondaryLinkClass,
} from '@/components/admin/classes';
import { GateCard } from '@/components/quiz/gate-card';
import { SessionRecovery } from '@/components/video/session-recovery';
import { getPublicLevel } from '@/lib/catalog';
import { pick } from '@/lib/localized';

export async function SignInGate({
  locale,
  next,
}: {
  locale: Locale;
  next: string;
}): Promise<React.JSX.Element> {
  const t = await getTranslations({ locale, namespace: 'Quiz' });
  const query = new URLSearchParams({ next });
  return (
    <>
      <SessionRecovery />
      <GateCard
        title={t('signInTitle')}
        body={t('signInBody')}
        actions={
          <>
            <Link
              href={`/${locale}/login?${query}`}
              className={primaryButtonClass}
            >
              {t('signIn')}
            </Link>
            <Link
              href={`/${locale}/register?${query}`}
              className={secondaryLinkClass}
            >
              {t('register')}
            </Link>
          </>
        }
      />
    </>
  );
}

export async function LevelGate({
  locale,
  levelSlug,
}: {
  locale: Locale;
  levelSlug: string;
}): Promise<React.JSX.Element> {
  const t = await getTranslations({ locale, namespace: 'Watch' });
  const level = await getPublicLevel(levelSlug);
  const title =
    level.status === 'ok'
      ? t('levelTitle', { level: pick(level.data.title, locale) })
      : t('levelTitleGeneric');
  return (
    <GateCard
      title={title}
      body={t('levelBody')}
      actions={
        <Link
          href={`/${locale}/levels/${levelSlug}`}
          className={primaryButtonClass}
        >
          {t('viewLevel')}
        </Link>
      }
    />
  );
}

export async function ErrorGate({
  locale,
}: {
  locale: Locale;
}): Promise<React.JSX.Element> {
  const t = await getTranslations({ locale, namespace: 'Quiz' });
  return <GateCard title={t('errorTitle')} body={t('errorBody')} />;
}
