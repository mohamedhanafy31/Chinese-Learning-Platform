'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import {
  progressReportResponseSchema,
  type LessonProgress,
  type PlaybackVideo,
} from '@app/shared';

import { LessonProgressStatus } from '@/components/learning/lesson-progress-status';
import {
  LessonPlayer,
  VideoPlaceholder,
} from '@/components/video/lesson-player';
import { apiFetch, jsonRequest } from '@/lib/api-client';
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

  // A lesson with nothing to watch or pass is complete once an enrolled
  // learner has it in front of them. That is reported here, from the browser
  // after the page is shown, never from the server render: Next prefetches
  // lesson links, and a prefetch must not complete anything. The API decides
  // (it only completes it for enrolled learners).
  const reportsOpening =
    initial !== null &&
    !initial.complete &&
    video === null &&
    initial.quizzes.total === 0;
  useEffect(() => {
    if (!reportsOpening) return;
    let active = true;
    void apiFetch<unknown>(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}/progress`,
      jsonRequest({ segments: [], positionSec: 0 }, { method: 'POST' }),
    ).then((result) => {
      if (!active || !result.ok) return;
      const parsed = progressReportResponseSchema.safeParse(result.data);
      if (!parsed.success) return;
      setProgress((current) =>
        current
          ? {
              ...current,
              complete: parsed.data.complete,
              nextLessonId: parsed.data.nextLessonId,
            }
          : current,
      );
    });
    return () => {
      active = false;
    };
  }, [reportsOpening, lessonId]);

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
