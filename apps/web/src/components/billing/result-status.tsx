'use client';

import { CircleAlert, LoaderCircle, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  OrderStatus,
  myLevelsResponseSchema,
  orderSummarySchema,
  type Locale,
  type OrderSummary,
} from '@app/shared';

import { WriteOn } from '@/components/motion/write-on';
import { Seal } from '@/components/porcelain/seal';
import { apiFetchParsed } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { pick } from '@/lib/localized';
import { formatEgp } from '@/lib/price';

const POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_WINDOW_MS = 60_000;

function isTerminal(status: OrderSummary['status']): boolean {
  return status !== OrderStatus.PENDING;
}

export function ResultStatus({
  initialOrder,
  initialStartHref = null,
  locale,
  pollWindowMs = DEFAULT_POLL_WINDOW_MS,
}: {
  initialOrder: OrderSummary;
  /** The bought level's next lesson, when the server already knows it. */
  initialStartHref?: string | null;
  locale: Locale;
  /** Test seam for fake timers; production uses the required 60-second window. */
  pollWindowMs?: number;
}): React.JSX.Element {
  const t = useTranslations('Billing.result');
  const [order, setOrder] = useState(initialOrder);
  const [timedOut, setTimedOut] = useState(false);
  const [startHref, setStartHref] = useState(initialStartHref);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef(0);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const paidRef = useRef<HTMLDivElement>(null);
  const sealRef = useRef<HTMLSpanElement>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const poll = useCallback(
    async (generation: number) => {
      if (
        !mountedRef.current ||
        generation !== generationRef.current ||
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      elapsedRef.current += POLL_INTERVAL_MS;
      if (elapsedRef.current >= pollWindowMs) {
        setTimedOut(true);
        return;
      }

      const result = await apiFetchParsed(
        `/api/v1/billing/orders/${encodeURIComponent(initialOrder.id)}`,
        orderSummarySchema,
      );
      if (!mountedRef.current || generation !== generationRef.current) return;
      if (result.ok) {
        setOrder(result.data);
        if (isTerminal(result.data.status)) return;
      }
      timerRef.current = setTimeout(
        () => void poll(generation),
        POLL_INTERVAL_MS,
      );
    },
    [initialOrder.id, pollWindowMs],
  );

  const startPolling = useCallback(
    (reset = false) => {
      clearTimer();
      if (reset) {
        elapsedRef.current = 0;
        setTimedOut(false);
      }
      if (isTerminal(order.status) || document.visibilityState === 'hidden') {
        return;
      }
      generationRef.current += 1;
      const generation = generationRef.current;
      timerRef.current = setTimeout(
        () => void poll(generation),
        POLL_INTERVAL_MS,
      );
    },
    [clearTimer, order.status, poll],
  );

  const restartPolling = useCallback(() => {
    generationRef.current += 1;
    clearTimer();
    elapsedRef.current = 0;
    setTimedOut(false);
  }, [clearTimer]);

  useEffect(() => {
    mountedRef.current = true;
    if (!timedOut) startPolling();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        generationRef.current += 1;
        clearTimer();
      } else if (!timedOut && !isTerminal(order.status)) {
        startPolling();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      clearTimer();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [clearTimer, order.status, startPolling, timedOut]);

  useEffect(() => {
    if (order.status !== OrderStatus.PAID) return;
    const frame = requestAnimationFrame(() => {
      const writeOn =
        paidRef.current?.querySelector<HTMLElement>('[data-write]');
      if (writeOn) writeOn.dataset.inview = 'true';
      if (sealRef.current) sealRef.current.dataset.inview = 'true';
    });
    return () => cancelAnimationFrame(frame);
  }, [order.status]);

  // An order that became paid while this page was open: now that the learner
  // owns the level, look up the lesson to start with (the level page is the
  // fallback if that fails).
  useEffect(() => {
    if (order.status !== OrderStatus.PAID || startHref) return;
    let cancelled = false;
    void apiFetchParsed('/api/v1/me/levels', myLevelsResponseSchema).then(
      (result) => {
        if (cancelled || !result.ok) return;
        const next = result.data.levels.find(
          (level) => level.slug === order.levelSlug,
        )?.progress.nextLessonId;
        if (next) {
          setStartHref(`/${locale}/learn/${order.levelSlug}/${next}`);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [locale, order.levelSlug, order.status, startHref]);

  const title = pick(order.levelTitle, locale);
  const levelHref = `/${locale}/levels/${order.levelSlug}`;

  if (order.status === OrderStatus.PAID) {
    return (
      <div ref={paidRef} data-testid="billing-paid">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <div className="min-w-0">
            <h1 className="font-display text-balance text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-deep">
              <WriteOn text={t('paidTitle', { level: title })} />
            </h1>
            <p className="mt-5 text-lg text-cobalt tabular">
              {t('paidMeta', {
                amount: formatEgp(order.amountMinor, locale),
                date: formatDateTime(order.paidAt ?? order.createdAt, locale),
              })}
            </p>
          </div>
          <span ref={sealRef} data-reveal="seal" data-testid="purchase-seal">
            <Seal size={88} label={t('sealedBy')} />
          </span>
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href={startHref ?? levelHref}
            className="inline-flex min-h-14 items-center justify-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt"
          >
            {t('start')}
          </Link>
          <Link
            href={`/${locale}/dashboard`}
            className="inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-8 hover:text-deep"
          >
            {t('myLevels')}
          </Link>
        </div>
      </div>
    );
  }

  if (order.status === OrderStatus.REFUNDED) {
    return (
      <div data-testid="billing-refunded">
        <RotateCcw aria-hidden="true" className="size-9 text-deep" />
        <h1 className="mt-5 font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-deep">
          {t('refundedTitle')}
        </h1>
        <p className="mt-4 max-w-[40rem] text-lg leading-[1.8] text-cobalt">
          {t('refundedBody', { level: title })}
        </p>
        <Link
          href={`/${locale}/orders`}
          className="mt-7 inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-8 hover:text-deep"
        >
          {t('viewOrders')}
        </Link>
      </div>
    );
  }

  if (
    order.status === OrderStatus.EXPIRED ||
    order.status === OrderStatus.CANCELED
  ) {
    return (
      <div data-testid="billing-failed">
        <CircleAlert aria-hidden="true" className="size-9 text-deep" />
        <h1 className="mt-5 font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-deep">
          {t('failedTitle')}
        </h1>
        <p className="mt-4 max-w-[40rem] text-lg leading-[1.8] text-cobalt">
          {t('failedBody')}
        </p>
        <Link
          href={levelHref}
          className="mt-8 inline-flex min-h-14 items-center justify-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt"
        >
          {t('tryAgain')}
        </Link>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div data-testid="billing-timeout">
        <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-deep">
          {t('waitingTitle')}
        </h1>
        <p className="mt-5 max-w-[40rem] text-lg leading-[1.8] text-cobalt">
          {t('waitingBody')}
        </p>
        <button
          type="button"
          onClick={restartPolling}
          className="mt-8 inline-flex min-h-14 items-center justify-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt"
        >
          {t('checkAgain')}
        </button>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" data-testid="billing-confirming">
      <LoaderCircle
        aria-hidden="true"
        className="size-10 animate-spin text-cobalt"
      />
      <h1 className="mt-6 font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-deep">
        {t('confirmingTitle')}
      </h1>
      <p className="mt-4 max-w-[40rem] text-lg leading-[1.8] text-cobalt">
        {t('confirmingBody')}
      </p>
    </div>
  );
}
