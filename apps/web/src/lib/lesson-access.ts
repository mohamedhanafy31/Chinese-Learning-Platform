import type { LessonAccess, LevelAccessResponse } from '@app/shared';

import type { PathState } from '@/components/learning/lesson-path';

/**
 * Maps what the API says a viewer may do onto the lesson path's visual state.
 * Without an access answer (anonymous fallback, or the access call failed) a
 * free preview stays a preview and every other lesson is locked.
 */
export function pathStateFor(
  lesson: { isFreePreview: boolean },
  access: LessonAccess | undefined,
): PathState {
  if (access === 'open') return 'open';
  if (access === 'preview') return 'preview';
  if (access === 'locked') return 'locked';
  return lesson.isFreePreview ? 'preview' : 'locked';
}

export function accessById(
  response: LevelAccessResponse | null,
): Map<string, LessonAccess> {
  return new Map(
    (response?.lessons ?? []).map((lesson) => [lesson.id, lesson.access]),
  );
}
