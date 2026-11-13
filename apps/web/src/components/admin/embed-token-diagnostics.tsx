import { useTranslations } from 'next-intl';

import { Notice } from '@/components/ui/notice';

type Status =
  'enforced' | 'not-enforced' | 'unknown' | 'no-video' | 'not-configured';

export function EmbedTokenDiagnostics({
  status,
}: {
  status: Status;
}): React.JSX.Element {
  const t = useTranslations('Admin.diagnostics.embedTokens');
  return (
    <section
      aria-labelledby="diag-embed-tokens"
      className="rounded-2xl border-[1.5px] border-wash p-6"
    >
      <h2 id="diag-embed-tokens" className="text-xl font-semibold text-deep">
        {t('title')}
      </h2>
      {status === 'not-enforced' ? (
        <div data-testid="diagnostics-embed-warning" className="mt-3">
          <Notice role="alert" title={t('notEnforcedTitle')}>
            {t('notEnforcedBody')}
          </Notice>
        </div>
      ) : (
        <p
          data-testid="diagnostics-embed-status"
          className={`mt-3 ${status === 'enforced' ? 'text-cobalt' : 'text-cobalt/70'}`}
        >
          {t(status)}
        </p>
      )}
    </section>
  );
}
