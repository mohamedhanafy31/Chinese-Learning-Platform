import { describe, expect, it } from 'vitest';

import { lessonAccessSchema, type LessonAccess } from '@app/shared';

import { accessById, pathStateFor, progressSegments } from './lesson-access';

describe('pathStateFor', () => {
  it('maps every access state emitted by the shared API contract', () => {
    for (const access of lessonAccessSchema.options) {
      expect(pathStateFor({ isFreePreview: false }, access)).toBeDefined();
      expect(
        progressSegments([{ id: access, access }])[0]?.state,
      ).toBeDefined();
    }
  });
  it.each([
    [true, 'open', 'open'],
    [false, 'open', 'open'],
    [true, 'preview', 'preview'],
    [false, 'locked', 'locked'],
    [true, 'locked', 'locked'],
    [false, 'done', 'done'],
    [true, 'done', 'done'],
    [false, 'next', 'next'],
    [true, 'next', 'next'],
  ] as const)(
    'free=%s access=%s shows %s',
    (isFreePreview, access, expected) => {
      expect(pathStateFor({ isFreePreview }, access)).toBe(expected);
    },
  );

  it('falls back to the anonymous view without an access answer', () => {
    expect(pathStateFor({ isFreePreview: true }, undefined)).toBe('locked');
    expect(pathStateFor({ isFreePreview: false }, undefined)).toBe('locked');
  });
});

describe('accessById', () => {
  it('indexes lessons by id and tolerates a missing response', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(accessById({ lessons: [{ id, access: 'open' }] }).get(id)).toBe(
      'open',
    );
    expect(accessById(null).size).toBe(0);
  });
});

describe('a path built from the API sequence', () => {
  const lessons: { id: string; access: LessonAccess }[] = [
    { id: 'a', access: 'done' },
    { id: 'b', access: 'next' },
    { id: 'c', access: 'preview' },
    { id: 'd', access: 'locked' },
  ];

  it('has exactly one next lesson', () => {
    const states = lessons.map(({ id, access }) =>
      pathStateFor(
        { isFreePreview: false },
        accessById({ lessons }).get(id) ?? access,
      ),
    );
    expect(states).toEqual(['done', 'next', 'preview', 'locked']);
    expect(states.filter((state) => state === 'next')).toHaveLength(1);
  });

  it('maps every segment of the progress bar', () => {
    expect(progressSegments(lessons)).toEqual([
      { id: 'a', state: 'done' },
      { id: 'b', state: 'next' },
      { id: 'c', state: 'preview' },
      { id: 'd', state: 'locked' },
    ]);
  });
});
