import { describe, expect, it } from 'vitest';

import {
  lessonPublishReadiness,
  levelPublishReadiness,
} from './publish-readiness';

describe('publish readiness', () => {
  it('requires an active published lesson for a level', () => {
    expect(
      levelPublishReadiness({
        coverImageId: null,
        topics: [],
        lessons: [{ isPublished: true, archivedAt: null }],
      }),
    ).toEqual({ required: true, recommended: [false, false] });
    expect(
      levelPublishReadiness({
        coverImageId: 'cover',
        topics: [{}],
        lessons: [{ isPublished: true, archivedAt: 'archived' }],
      }),
    ).toEqual({ required: false, recommended: [true, true] });
  });

  it('accepts a ready video or a live quiz with questions for a lesson', () => {
    const lesson = { description: null, thumbnailId: null, video: null };
    expect(lessonPublishReadiness(lesson, [])).toEqual({
      required: false,
      recommended: [false, false],
    });
    expect(
      lessonPublishReadiness(lesson, [{ archivedAt: null, questionCount: 1 }]),
    ).toMatchObject({ required: true });
  });
});
