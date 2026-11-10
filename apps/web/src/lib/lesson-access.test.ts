import { describe, expect, it } from 'vitest';

import { accessById, pathStateFor } from './lesson-access';

describe('pathStateFor', () => {
  it.each([
    [true, 'open', 'open'],
    [false, 'open', 'open'],
    [true, 'preview', 'preview'],
    [false, 'locked', 'locked'],
    [true, 'locked', 'locked'],
  ] as const)(
    'free=%s access=%s shows %s',
    (isFreePreview, access, expected) => {
      expect(pathStateFor({ isFreePreview }, access)).toBe(expected);
    },
  );

  it('falls back to the anonymous view without an access answer', () => {
    expect(pathStateFor({ isFreePreview: true }, undefined)).toBe('preview');
    expect(pathStateFor({ isFreePreview: false }, undefined)).toBe('locked');
  });
});

describe('accessById', () => {
  it('indexes lessons by id and tolerates a missing response', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(
      accessById({ enrolled: true, lessons: [{ id, access: 'open' }] }).get(id),
    ).toBe('open');
    expect(accessById(null).size).toBe(0);
  });
});
