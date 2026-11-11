import {
  pathAccess,
  sequenceState,
  type LessonAccessLabel,
} from './content-access';

export interface LevelProgressLesson {
  id: string;
  isFreePreview: boolean;
  title: unknown;
}

export interface LevelProgressSummary {
  completed: number;
  total: number;
  nextLessonId: string | null;
  nextLesson: { id: string; number: number; title: unknown } | null;
  lessons: { id: string; access: LessonAccessLabel }[];
}

/**
 * An enrolled learner's place in one level: how many visible lessons are done,
 * which one comes next, and how each lesson shows on a path. Pure: the same
 * `sequenceState` the access policy's sequence lock is built on.
 */
export function summariseLevel(
  lessons: readonly LevelProgressLesson[],
  completed: ReadonlySet<string>,
): LevelProgressSummary {
  const states = sequenceState(
    lessons,
    completed,
    new Set(lessons.filter((lesson) => lesson.isFreePreview).map((l) => l.id)),
  );
  const nextIndex = states.findIndex(({ state }) => state === 'next');
  const next = nextIndex >= 0 ? lessons[nextIndex] : undefined;
  return {
    completed: states.filter(({ state }) => state === 'done').length,
    total: lessons.length,
    nextLessonId: next?.id ?? null,
    nextLesson: next
      ? { id: next.id, number: nextIndex + 1, title: next.title }
      : null,
    lessons: states.map(({ id, state }) => ({
      id,
      access: pathAccess({ allowed: true, reason: 'enrolled' }, state),
    })),
  };
}
