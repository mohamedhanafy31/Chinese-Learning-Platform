'use client';

import { useEffect, useRef, useState } from 'react';

import {
  adminLessonSchema,
  type AdminVideo,
  type PendingVideo,
} from '@app/shared';

import { apiFetchParsed } from '@/lib/api-client';

export const PENDING_POLL_MS = 5000;

export interface VideoSnapshot {
  video: AdminVideo | null;
  pending: PendingVideo | null;
}

/** An upload still moving: UPLOADING or PROCESSING. FAILED is final. */
export function isInFlight(pending: PendingVideo | null): boolean {
  return pending?.status === 'UPLOADING' || pending?.status === 'PROCESSING';
}

/**
 * Keeps the lesson's video and pending upload fresh. While a pending upload is
 * in flight it re-reads the lesson every five seconds; it stops as soon as the
 * upload becomes READY (the pending entry disappears and `onReady` fires) or
 * FAILED, and when the component unmounts. Fresh props from the server
 * (after `router.refresh()`) take over from the last poll.
 */
export function usePendingVideo(options: {
  lessonId: string;
  video: AdminVideo | null;
  pending: PendingVideo | null;
  intervalMs?: number;
  onReady?: () => void;
}): VideoSnapshot {
  const { intervalMs = PENDING_POLL_MS, lessonId } = options;
  const [state, setState] = useState<VideoSnapshot>({
    video: options.video,
    pending: options.pending,
  });
  const onReady = useRef(options.onReady);
  onReady.current = options.onReady;

  const propsKey = [
    options.video?.id ?? '',
    options.video?.status ?? '',
    options.pending?.id ?? '',
    options.pending?.status ?? '',
  ].join('|');
  const lastPropsKey = useRef(propsKey);
  useEffect(() => {
    if (lastPropsKey.current === propsKey) return;
    lastPropsKey.current = propsKey;
    setState({ video: options.video, pending: options.pending });
  }, [propsKey, options.video, options.pending]);

  const active = isInFlight(state.pending);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void apiFetchParsed(
        `/api/v1/admin/lessons/${lessonId}`,
        adminLessonSchema,
      )
        .then((result) => {
          if (cancelled || !result.ok) return;
          const next = {
            video: result.data.video,
            pending: result.data.pendingVideo,
          };
          setState(next);
          if (!next.pending) onReady.current?.();
        })
        .finally(() => {
          inFlight = false;
        });
    }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, lessonId, intervalMs]);

  return state;
}
