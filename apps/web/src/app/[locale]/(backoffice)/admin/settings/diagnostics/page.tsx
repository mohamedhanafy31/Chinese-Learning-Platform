import { CircleAlert, Info } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { CopyButton } from '@/components/admin/copy-button';
import { EmbedTokenDiagnostics } from '@/components/admin/embed-token-diagnostics';
import { PendingVideoDeleteNotice } from '@/components/admin/pending-video-delete-notice';
import { getVideoDiagnostics } from '@/lib/admin-api';
import { numberFormat } from '@/lib/numbers';
import { requireUser } from '@/lib/protected-session';
import { siteUrl } from '@/lib/site-url';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('adminDiagnostics'),
    robots: { index: false, follow: false },
  };
}

function formatWhen(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    // The audience is in Egypt; the server clock is not.
    timeZone: 'Africa/Cairo',
    timeZoneName: 'short',
  }).format(new Date(iso));
}

const card = 'rounded-2xl border-[1.5px] border-wash p-6';

export default async function DiagnosticsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale, `/${locale}/admin/settings/diagnostics`, true);
  const t = await getTranslations('Admin.diagnostics');
  const diagnostics = await getVideoDiagnostics();
  const nf = numberFormat(locale);
  const webhookUrl = `${siteUrl()}/api/v1/webhooks/bunny`;

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-8 lg:py-20">
      <h1 className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
        {t('title')}
      </h1>
      <p className="mt-3 max-w-[34rem] text-lg leading-[1.8] text-cobalt">
        {t('intro')}
      </p>

      {diagnostics === null ? (
        <div
          role="alert"
          data-testid="diagnostics-unavailable"
          className="mt-10 flex items-start gap-3 rounded-2xl bg-glaze-shade px-5 py-4 text-deep"
        >
          <CircleAlert aria-hidden="true" className="mt-1 size-5 shrink-0" />
          <div>
            <p className="font-semibold">{t('unavailableTitle')}</p>
            <p className="mt-1 text-cobalt">{t('unavailableBody')}</p>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid gap-6">
          {diagnostics.devOnly ? (
            <p
              role="note"
              data-testid="diagnostics-dev-only"
              className="flex items-start gap-3 rounded-2xl bg-glaze-shade px-4 py-3 text-sm font-semibold leading-relaxed text-deep"
            >
              <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              {t('devOnly')}
            </p>
          ) : null}

          <PendingVideoDeleteNotice count={diagnostics.counts.pendingDeletes} />

          <div className="grid gap-6 md:grid-cols-2">
            <section aria-labelledby="diag-provider" className={card}>
              <h2
                id="diag-provider"
                className="text-xl font-semibold text-deep"
              >
                {t('activeTitle')}
              </h2>
              <p
                data-testid="diagnostics-active"
                className="mt-3 font-display text-4xl leading-tight text-deep"
              >
                {t(`active.${diagnostics.active}`)}
              </p>
              <p className="mt-4 text-cobalt">
                {t('bunnyConfigured')}:{' '}
                <strong
                  data-testid="diagnostics-configured"
                  className="font-semibold text-deep"
                >
                  {diagnostics.bunny.configured ? t('yes') : t('no')}
                </strong>
              </p>
              <h3 className="mt-5 text-sm font-semibold text-deep">
                {t('missingTitle')}
              </h3>
              {diagnostics.bunny.missing.length === 0 ? (
                <p className="mt-2 text-cobalt">{t('missingNone')}</p>
              ) : (
                <ul
                  data-testid="diagnostics-missing"
                  className="mt-2 flex flex-wrap gap-2"
                >
                  {diagnostics.bunny.missing.map((name) => (
                    <li key={name}>
                      <code
                        dir="ltr"
                        className="inline-block rounded-full bg-glaze-shade px-3 py-1 font-mono text-sm text-deep"
                      >
                        {name}
                      </code>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="diag-counts" className={card}>
              <h2 id="diag-counts" className="text-xl font-semibold text-deep">
                {t('countsTitle')}
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-4">
                {(['local', 'bunny', 'processing', 'failed'] as const).map(
                  (key) => (
                    <div key={key}>
                      <dt className="text-sm text-cobalt">
                        {t(`counts.${key}`)}
                      </dt>
                      <dd
                        data-testid={`diagnostics-count-${key}`}
                        className="text-3xl font-semibold text-deep tabular"
                      >
                        {nf.format(diagnostics.counts[key])}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
              <p className="mt-5 text-sm text-cobalt">
                {t('lastWebhook')}:{' '}
                <strong
                  data-testid="diagnostics-last-webhook"
                  className="font-semibold text-deep"
                >
                  {diagnostics.lastWebhookAt
                    ? formatWhen(diagnostics.lastWebhookAt, locale)
                    : t('never')}
                </strong>
              </p>
            </section>
          </div>

          <EmbedTokenDiagnostics status={diagnostics.embedTokens.status} />

          <section aria-labelledby="diag-webhook" className={card}>
            <h2 id="diag-webhook" className="text-xl font-semibold text-deep">
              {t('webhookTitle')}
            </h2>
            <p className="mt-2 max-w-[40rem] text-cobalt">{t('webhookBody')}</p>
            <p className="mt-4">
              <code
                dir="ltr"
                data-testid="diagnostics-webhook-url"
                className="block break-all rounded-2xl bg-glaze-shade px-4 py-3 font-mono text-sm text-deep"
              >
                {webhookUrl}
              </code>
            </p>
            <div className="mt-3">
              <CopyButton
                value={webhookUrl}
                label={t('copy')}
                copiedLabel={t('copied')}
                failedLabel={t('copyFailed')}
              />
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
