'use client';

import { useEffect, useState } from 'react';

import { playbackResponseSchema, type AdminVideo } from '@app/shared';

import { apiFetchParsed } from '@/lib/api-client';

export type AdminBunnyPreviewState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'other' }
  | { kind: 'bunny'; embedUrl: string; expiresAt: string };

export function useAdminBunnyPreview(
  lessonId: string,
  video: AdminVideo,
): { state: AdminBunnyPreviewState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AdminBunnyPreviewState>({
    kind: 'loading',
  });

  useEffect(() => {
    let current = true;
    setState({ kind: 'loading' });
    void apiFetchParsed(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}/playback`,
      playbackResponseSchema,
    )
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          setState({ kind: 'error' });
        } else if (result.data.video.provider === 'BUNNY') {
          setState({
            kind: 'bunny',
            embedUrl: result.data.video.embedUrl,
            expiresAt: result.data.video.expiresAt,
          });
        } else {
          setState({ kind: 'other' });
        }
      })
      .catch(() => {
        if (current) setState({ kind: 'error' });
      });
    return () => {
      current = false;
    };
  }, [attempt, lessonId, video.id, video.status]);

  return { state, retry: () => setAttempt((value) => value + 1) };
}
