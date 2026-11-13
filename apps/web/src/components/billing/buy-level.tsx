'use client';

import { CircleAlert, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { checkoutResponseSchema, type Locale } from '@app/shared';

import { apiFetchParsed, jsonRequest } from '@/lib/api-client';

type CheckoutError =
  | 'generic'
  | 'not-for-sale'
  | 'payments-unavailable'
  | 'provider-error'
  | 'too-many';

interface BuyLevelProps {
  available: boolean;
  levelId: string;
  levelPath: string;
  locale: Locale;
  price: string;
  signedIn: boolean;
}

async function reasonOf(response?: Response): Promise<string | null> {
  const body: unknown = await response?.json().catch(() => null);
  return typeof body === 'object' && body !== null && 'reason' in body
    ? String(body.reason)
    : null;
}

export function BuyLevel({
  available,
  levelId,
  levelPath,
  locale,
  price,
  signedIn,
}: BuyLevelProps): React.JSX.Element {
  const router = useRouter();
  const t = useTranslations('Billing.buy');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CheckoutError | null>(null);
  const nextQuery = new URLSearchParams({ next: levelPath });

  async function checkout(): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await apiFetchParsed(
      '/api/v1/billing/checkout',
      checkoutResponseSchema,
      jsonRequest({ levelId, locale }, { method: 'POST' }),
    );
    if (result.ok) {
      window.location.assign(result.data.checkoutUrl);
      return;
    }

    if (result.status === 409) {
      const reason = await reasonOf(result.response);
      if (reason === 'already-enrolled') {
        router.refresh();
        return;
      }
      setError('not-for-sale');
    } else if (result.status === 503) {
      setError('payments-unavailable');
    } else if (result.status === 502) {
      setError('provider-error');
    } else if (result.status === 429) {
      setError('too-many');
    } else {
      setError('generic');
    }
    setPending(false);
  }

  if (!signedIn) {
    return (
      <div className="flex max-w-[24rem] flex-col items-start gap-2 md:items-end lg:items-start">
        <Link
          href={`/${locale}/register?${nextQuery}`}
          className="inline-flex min-h-14 items-center justify-center rounded-full bg-deep px-8 text-center text-lg font-semibold text-glaze transition-colors hover:bg-cobalt"
        >
          {t('register', { price })}
        </Link>
        <Link
          href={`/${locale}/login?${nextQuery}`}
          className="inline-flex min-h-11 items-center text-sm text-cobalt underline decoration-wash-strong underline-offset-8 hover:text-deep"
        >
          {t('signIn')}
        </Link>
      </div>
    );
  }

  if (!available) {
    return (
      <div className="flex max-w-[24rem] flex-col items-start gap-2 md:items-end lg:items-start">
        <button
          type="button"
          disabled
          className="inline-flex min-h-14 items-center rounded-full bg-wash px-8 text-lg font-semibold text-cobalt disabled:cursor-not-allowed"
        >
          {t('buy', { price })}
        </button>
        <p className="text-sm leading-relaxed text-cobalt">
          {t('unavailable')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex max-w-[24rem] flex-col items-start gap-2 md:items-end lg:items-start">
      <button
        type="button"
        onClick={() => void checkout()}
        disabled={pending}
        aria-busy={pending}
        className="inline-flex min-h-14 items-center justify-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt disabled:cursor-not-allowed disabled:bg-wash disabled:text-cobalt"
      >
        {pending ? (
          <LoaderCircle
            aria-hidden="true"
            className="me-2 size-5 animate-spin"
          />
        ) : null}
        {pending ? t('pending') : t('buy', { price })}
      </button>
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl border-s-4 border-deep bg-glaze-shade px-4 py-3 text-sm font-semibold leading-relaxed text-deep"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t(`error.${error}`)}
        </p>
      ) : null}
    </div>
  );
}
