import { Role } from '@app/shared';

import {
  decideLesson,
  firstIncompleteLesson,
  pathAccess,
  sequenceState,
  type SequenceState,
} from '../learning/content-access';
import { summariseLevel } from '../learning/level-progress';

const ids = (...names: string[]) => names.map((id) => ({ id }));
const set = (...names: string[]) => new Set(names);
const states = (
  lessons: { id: string }[],
  done: Set<string>,
  previews: Set<string> = set(),
): SequenceState[] =>
  sequenceState(lessons, done, previews).map(({ state }) => state);

describe('sequenceState', () => {
  const l = ids('a', 'b', 'c', 'd');

  it('makes the first lesson next on a fresh level', () => {
    expect(states(l, set())).toEqual(['next', 'locked', 'locked', 'locked']);
  });

  it('marks finished lessons done and the following one next', () => {
    expect(states(l, set('a', 'b'))).toEqual([
      'done',
      'done',
      'next',
      'locked',
    ]);
  });

  it('has no next once everything is done', () => {
    expect(states(l, set('a', 'b', 'c', 'd'))).toEqual([
      'done',
      'done',
      'done',
      'done',
    ]);
  });

  it('keeps a free preview in the middle open without moving next', () => {
    expect(states(l, set(), set('c'))).toEqual([
      'next',
      'locked',
      'open-preview',
      'locked',
    ]);
  });

  it('does not make a preview lesson the next one while others are open', () => {
    expect(states(l, set(), set('a'))).toEqual([
      'open-preview',
      'next',
      'locked',
      'locked',
    ]);
  });

  it('does not wait for a preview before the lessons after it', () => {
    expect(states(l, set('b'), set('a'))).toEqual([
      'open-preview',
      'done',
      'next',
      'locked',
    ]);
  });

  it('counts a preview completed out of order as done', () => {
    expect(states(l, set('c'), set('c'))).toEqual([
      'next',
      'locked',
      'done',
      'locked',
    ]);
  });

  it('sends the learner back to an unfinished preview once the rest is done', () => {
    expect(states(l, set('b', 'c', 'd'), set('a'))).toEqual([
      'next',
      'done',
      'done',
      'done',
    ]);
    expect(states(l, set('c', 'd'), set('a', 'b'))).toEqual([
      'next',
      'open-preview',
      'done',
      'done',
    ]);
  });

  it('is empty for an empty level', () => {
    expect(states([], set())).toEqual([]);
  });

  it('always has exactly one next unless all are done', () => {
    for (const done of [set(), set('a'), set('a', 'c'), set('b', 'd')]) {
      expect(states(l, done).filter((state) => state === 'next')).toHaveLength(
        1,
      );
    }
  });
});

describe('firstIncompleteLesson', () => {
  const earlier = [
    { id: 'a', isFreePreview: true },
    { id: 'b', isFreePreview: false },
    { id: 'c', isFreePreview: false },
  ];
  it('names the first earlier non-preview lesson that is not done', () => {
    expect(firstIncompleteLesson(earlier, set())).toBe('b');
    expect(firstIncompleteLesson(earlier, set('b'))).toBe('c');
  });
  it('skips free previews, even unfinished ones', () => {
    expect(firstIncompleteLesson(earlier.slice(0, 1), set())).toBeNull();
  });
  it('is null when all are done or there are none', () => {
    expect(firstIncompleteLesson(earlier, set('b', 'c'))).toBeNull();
    expect(firstIncompleteLesson([], set())).toBeNull();
  });
});

describe('decideLesson with a sequence block', () => {
  const lesson = { isPublished: true, archivedAt: null, isFreePreview: false };
  const level = { isPublished: true, archivedAt: null };
  const student = { id: 's', role: Role.STUDENT };
  const enrollment = { revokedAt: null };

  it('denies an enrolled learner with sequence-locked and the required id', () => {
    expect(
      decideLesson({
        user: student,
        lesson,
        level,
        enrollment,
        requiredLessonId: 'earlier',
      }),
    ).toEqual({
      allowed: false,
      reason: 'sequence-locked',
      requiredLessonId: 'earlier',
    });
  });

  it('allows when nothing blocks', () => {
    expect(decideLesson({ user: student, lesson, level, enrollment })).toEqual({
      allowed: true,
      reason: 'enrolled',
    });
  });

  it('never blocks admins or free previews', () => {
    expect(
      decideLesson({
        user: { id: 'a', role: Role.ADMIN },
        lesson,
        level,
        enrollment: null,
        requiredLessonId: 'earlier',
      }),
    ).toEqual({ allowed: true, reason: 'admin' });
    expect(
      decideLesson({
        user: student,
        lesson: { ...lesson, isFreePreview: true },
        level,
        enrollment,
        requiredLessonId: 'earlier',
      }),
    ).toEqual({ allowed: true, reason: 'enrolled' });
  });

  it('keeps archived levels open for buyers, sequence included', () => {
    const archived = { isPublished: true, archivedAt: new Date() };
    expect(
      decideLesson({
        user: student,
        lesson,
        level: archived,
        enrollment,
        requiredLessonId: 'earlier',
      }).reason,
    ).toBe('sequence-locked');
    expect(
      decideLesson({ user: student, lesson, level: archived, enrollment })
        .allowed,
    ).toBe(true);
  });

  it('applies the sequence to any account on a published level', () => {
    expect(
      decideLesson({
        user: student,
        lesson,
        level,
        enrollment: { revokedAt: new Date() },
        requiredLessonId: 'earlier',
      }).reason,
    ).toBe('sequence-locked');
  });
});

describe('pathAccess', () => {
  const enrolled = { allowed: true, reason: 'enrolled' as const };
  it('maps the sequence for an enrolled learner', () => {
    expect(pathAccess(enrolled, 'done')).toBe('done');
    expect(pathAccess(enrolled, 'next')).toBe('next');
    expect(pathAccess(enrolled, 'open-preview')).toBe('preview');
    expect(pathAccess(enrolled, 'locked')).toBe('locked');
  });
  it('keeps staff open and the public preview/locked', () => {
    expect(pathAccess({ allowed: true, reason: 'admin' }, 'locked')).toBe(
      'open',
    );
    expect(
      pathAccess({ allowed: true, reason: 'free-preview' }, undefined),
    ).toBe('preview');
    expect(
      pathAccess({ allowed: false, reason: 'not-enrolled' }, undefined),
    ).toBe('locked');
  });
});

describe('summariseLevel', () => {
  const lessons = ['a', 'b', 'c'].map((id, index) => ({
    id,
    isFreePreview: index === 2,
    title: { en: id },
  }));
  // a, b are regular lessons; c is a free preview.

  it('counts, points at the next lesson and labels each lesson', () => {
    const summary = summariseLevel(lessons, set('a'));
    expect(summary).toMatchObject({
      completed: 1,
      total: 3,
      nextLessonId: 'b',
      nextLesson: { id: 'b', number: 2 },
    });
    expect(summary.lessons.map(({ access }) => access)).toEqual([
      'done',
      'next',
      'preview',
    ]);
  });

  it('has no next lesson when the level is complete (archived or not)', () => {
    const summary = summariseLevel(lessons, set('a', 'b', 'c'));
    expect(summary).toMatchObject({
      completed: 3,
      total: 3,
      nextLessonId: null,
      nextLesson: null,
    });
  });
});
