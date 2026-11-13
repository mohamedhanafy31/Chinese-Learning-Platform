'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { playbackResponseSchema } from '@app/shared';

import { apiFetchParsed } from '@/lib/api-client';
import { embedRefreshAction, embedRefreshDelay } from '@/lib/embed-refresh';

interface RefreshedEmbed {
  embedUrl: string;
  expiresAt: string;
}

export function useBunnyEmbedRefresh(
  lessonId: string | undefined,
  initial: RefreshedEmbed,
): {
  embedUrl: string;
  expiresAt: string;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
} {
  const router = useRouter();
  const [embed, setEmbed] = useState(initial);
  const playing = useRef(false);
  const pending = useRef<RefreshedEmbed | null>(null);
  const requestInFlight = useRef(false);

  const swapOrDefer = useCallback((next: RefreshedEmbed) => {
    if (playing.current) pending.current = next;
    else {
      pending.current = null;
      setEmbed(next);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!lessonId || requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      const result = await apiFetchParsed(
        `/api/v1/lessons/${encodeURIComponent(lessonId)}/playback`,
        playbackResponseSchema,
      );
      if (!result.ok) {
        if (
          result.kind === 'unauthenticated' ||
          result.status === 401 ||
          result.status === 403
        ) {
          router.refresh();
        }
        return;
      }
      if (result.data.video.provider !== 'BUNNY') {
        router.refresh();
        return;
      }
      swapOrDefer({
        embedUrl: result.data.video.embedUrl,
        expiresAt: result.data.video.expiresAt,
      });
    } finally {
      requestInFlight.current = false;
    }
  }, [lessonId, router, swapOrDefer]);

  const onPlay = useCallback(() => {
    playing.current = true;
    if (embedRefreshAction(Date.now(), embed.expiresAt, true) !== 'schedule') {
      void refresh();
    }
  }, [embed.expiresAt, refresh]);

  const onPause = useCallback(() => {
    playing.current = false;
    if (pending.current) {
      setEmbed(pending.current);
      pending.current = null;
      return;
    }
    if (embedRefreshAction(Date.now(), embed.expiresAt, false) !== 'schedule') {
      void refresh();
    }
  }, [embed.expiresAt, refresh]);

  const onEnded = useCallback(() => {
    playing.current = false;
    if (pending.current) {
      setEmbed(pending.current);
      pending.current = null;
    } else if (
      embedRefreshAction(Date.now(), embed.expiresAt, false) !== 'schedule'
    ) {
      void refresh();
    }
  }, [embed.expiresAt, refresh]);

  useEffect(() => {
    if (!lessonId) return;
    const action = embedRefreshAction(
      Date.now(),
      embed.expiresAt,
      playing.current,
    );
    if (action !== 'schedule') {
      void refresh();
      return;
    }
    const timer = window.setTimeout(
      () => void refresh(),
      embedRefreshDelay(Date.now(), embed.expiresAt),
    );
    return () => window.clearTimeout(timer);
  }, [embed.expiresAt, lessonId, refresh]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        embedRefreshAction(Date.now(), embed.expiresAt, playing.current) !==
          'schedule'
      ) {
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [embed.expiresAt, refresh]);

  return { ...embed, onPlay, onPause, onEnded };
}
