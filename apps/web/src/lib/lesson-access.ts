import type { LessonAccess, LevelAccessResponse } from '@app/shared';

import type { PathState } from '@/components/learning/lesson-path';

const STATE_OF: Record<LessonAccess, PathState> = {
  open: 'open',
  preview: 'preview',
  locked: 'locked',
  done: 'done',
  next: 'next',
};

/**
 * Maps what the API says a viewer may do onto the lesson path's visual state
 * (DESIGN.md, Lesson Path): `done` is fired and sealed, `next` is the single
 * cinnabar row, `locked` is unfired, `preview` is a free lesson and `open` is
 * staff access. Without an access answer (anonymous fallback, or the access
 * call failed), fail closed and show every lesson as locked until access can be
 * confirmed.
 */
export function pathStateFor(
  _lesson: { isFreePreview: boolean },
  access: LessonAccess | undefined,
): PathState {
  if (access) return STATE_OF[access];
  return 'locked';
}

export function accessById(
  response: Pick<LevelAccessResponse, 'lessons'> | null,
): Map<string, LessonAccess> {
  return new Map(
    (response?.lessons ?? []).map((lesson) => [lesson.id, lesson.access]),
  );
}

/** The progress bar's segments: one per lesson, in the path's terms. */
export function progressSegments(
  lessons: readonly { id: string; access: LessonAccess }[],
): { id: string; state: PathState }[] {
  return lessons.map(({ id, access }) => ({ id, state: STATE_OF[access] }));
}
