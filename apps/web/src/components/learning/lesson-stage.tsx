'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import type { LessonProgress, Locale, PlaybackVideo } from '@app/shared';

import { LessonProgressStatus } from '@/components/learning/lesson-progress-status';
import {
  LessonPlayer,
  VideoPlaceholder,
} from '@/components/video/lesson-player';
import { useLessonProgress } from '@/lib/use-lesson-progress';

/**
 * The player and everything that depends on what has been watched: the
 * requirements line and the completion status. Reports go to the API as the
 * video plays; its answer drives what the page shows, so the client never
 * decides that a lesson is complete. When the answer says it just became
 * complete the server-rendered path is refreshed (the next lesson becomes the
 * cinnabar row) without interrupting the player.
 */
export function LessonStage({
  levelSlug,
  lessonId,
  label,
  poster,
  progress: initial,
  video,
}: {
  levelSlug: string;
  lessonId: string;
  label: string;
  poster: string | null;
  /** The signed-in viewer's progress; null for anonymous viewers. */
  progress: LessonProgress | null;
  /** Null while the lesson has no video yet. */
  video: PlaybackVideo | null;
}): React.JSX.Element {
  const t = useTranslations('Watch');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const wasComplete = useRef(initial?.complete ?? false);

  const controller = useLessonProgress({
    lessonId,
    enabled: initial !== null && video !== null,
    onResult: (result) =>
      setProgress((current) =>
        current
          ? {
              ...current,
              watchedPercent: result.watchedPercent,
              videoComplete: result.videoComplete,
              complete: result.complete,
              nextLessonId: result.nextLessonId,
            }
          : current,
      ),
  });

  useEffect(() => {
    if (progress?.complete && !wasComplete.current) router.refresh();
    wasComplete.current = progress?.complete ?? false;
  }, [progress?.complete, router]);

  return (
    <>
      {video ? (
        <LessonPlayer
          label={label}
          video={video}
          poster={poster}
          unsupported={t('unsupported')}
          locale={locale}
          labels={{
            loading: t('player.loading'),
            play: t('player.play'),
            pause: t('player.pause'),
            seek: t('player.seek'),
            mute: t('player.mute'),
            unmute: t('player.unmute'),
            fullscreen: t('player.fullscreen'),
            exitFullscreen: t('player.exitFullscreen'),
            settings: t('player.settings'),
            playbackSpeed: t('player.playbackSpeed'),
            quality: t('player.quality'),
            originalQuality: t('player.originalQuality'),
          }}
          progress={
            initial
              ? { controller, lastPositionSec: initial.lastPositionSec }
              : undefined
          }
        />
      ) : (
        <VideoPlaceholder
          title={t('comingSoonTitle')}
          body={t('comingSoonBody')}
        />
      )}
      {progress ? (
        <LessonProgressStatus levelSlug={levelSlug} progress={progress} />
      ) : null}
    </>
  );
}
