'use client';

import { useEffect, useMemo, useRef } from 'react';

import {
  progressReportResponseSchema,
  type ProgressReportResponse,
} from '@app/shared';

import { apiFetchParsed, jsonRequest } from '@/lib/api-client';
import { WatchTracker } from '@/lib/watch-tracker';

export const FLUSH_INTERVAL_MS = 10_000;
/** Reports closer together than this wait for the next flush, unless forced. */
const MIN_GAP_MS = 1000;

export interface LessonProgressController {
  /** Media clock moved while playing (`timeupdate`). */
  tick(time: number, rate?: number): void;
  /** Playback started. */
  play(): void;
  /** Playback stopped; flushes. */
  pause(time?: number): void;
  /** A seek began. */
  seeking(): void;
  /** The video finished; flushes. */
  ended(duration: number): void;
  /** The player's own duration, sent only for assets without a stored one. */
  setDuration(duration: number): void;
  flush(force?: boolean): Promise<void>;
}

/**
 * Collects what the player plays and reports it to the API: every 10 s while
 * playing, and on pause, end, hidden tab and page close. A report that fails
 * for a transient reason is put back and goes out with the next one. The API
 * is the authority: it clamps what a report may add (see ProgressService).
 *
 * The hidden-tab and page-close reports use `fetch` with `keepalive`, which
 * carries the session cookies like any same-origin request and survives the
 * page; `navigator.sendBeacon` would do too but cannot be refreshed after a
 * 401 through `apiFetch`.
 */
export function useLessonProgress(options: {
  lessonId: string;
  /** False for anonymous viewers: nothing is tracked or sent. */
  enabled: boolean;
  onResult?: (result: ProgressReportResponse) => void;
}): LessonProgressController {
  const { lessonId, enabled } = options;
  const trackerRef = useRef(new WatchTracker());
  const durationRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);
  const lastPositionRef = useRef(-1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultRef = useRef(options.onResult);
  resultRef.current = options.onResult;

  const controller = useMemo<LessonProgressController>(() => {
    const tracker = trackerRef.current;

    async function flush(force = false): Promise<void> {
      if (!enabled) return;
      const now = Date.now();
      if (!force && now - lastSentRef.current < MIN_GAP_MS) return;
      const report = tracker.take();
      if (
        report.segments.length === 0 &&
        report.positionSec === lastPositionRef.current
      ) {
        return;
      }
      lastSentRef.current = now;
      const duration = durationRef.current;
      const result = await apiFetchParsed(
        `/api/v1/lessons/${encodeURIComponent(lessonId)}/progress`,
        progressReportResponseSchema,
        jsonRequest(
          {
            segments: report.segments,
            positionSec: report.positionSec,
            ...(duration ? { durationSec: duration } : {}),
          },
          { method: 'POST', keepalive: true },
        ),
      );
      if (result.ok) {
        lastPositionRef.current = report.positionSec;
        resultRef.current?.(result.data);
        return;
      }
      // Network trouble, throttling or a server error: try again next time.
      if (
        result.status === 0 ||
        result.status === 429 ||
        result.status >= 500
      ) {
        tracker.restore(report);
      }
    }

    const stopTimer = (): void => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };

    return {
      tick: (time, rate) => tracker.tick(time, rate),
      play() {
        if (!enabled || timerRef.current) return;
        timerRef.current = setInterval(
          () => void flush(true),
          FLUSH_INTERVAL_MS,
        );
      },
      pause(time) {
        stopTimer();
        tracker.pause(time);
        void flush();
      },
      seeking: () => tracker.seek(),
      ended(duration) {
        stopTimer();
        tracker.ended(duration);
        void flush(true);
      },
      setDuration(duration) {
        if (Number.isFinite(duration) && duration > 0) {
          durationRef.current = Math.round(duration);
        }
      },
      flush,
    };
  }, [enabled, lessonId]);

  useEffect(() => {
    if (!enabled) return;
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') {
        trackerRef.current.pause();
        void controller.flush(true);
      }
    };
    const onPageHide = (): void => {
      trackerRef.current.pause();
      void controller.flush(true);
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      trackerRef.current.pause();
      void controller.flush(true);
    };
  }, [controller, enabled]);

  return controller;
}
