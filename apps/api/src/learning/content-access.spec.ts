import { Role } from '@app/shared';

import {
  decideLesson,
  decideLevel,
  type AccessDecision,
  type AccessEnrollment,
  type AccessLesson,
  type AccessLevel,
  type AccessUser,
} from './content-access';

const date = new Date('2026-01-01T00:00:00Z');

const admin: AccessUser = { id: 'admin', role: Role.ADMIN };
const student: AccessUser = { id: 'student', role: Role.STUDENT };

const level = {
  published: { isPublished: true, archivedAt: null },
  draft: { isPublished: false, archivedAt: null },
  archivedPublished: { isPublished: true, archivedAt: date },
  archivedUnpublished: { isPublished: false, archivedAt: date },
} satisfies Record<string, AccessLevel>;

const lesson = {
  live: { isPublished: true, archivedAt: null, isFreePreview: false },
  preview: { isPublished: true, archivedAt: null, isFreePreview: true },
  draft: { isPublished: false, archivedAt: null, isFreePreview: false },
  draftPreview: { isPublished: false, archivedAt: null, isFreePreview: true },
  archived: { isPublished: true, archivedAt: date, isFreePreview: false },
  archivedPreview: { isPublished: true, archivedAt: date, isFreePreview: true },
} satisfies Record<string, AccessLesson>;

const active: AccessEnrollment = { revokedAt: null };
const revoked: AccessEnrollment = { revokedAt: date };

const decision = (
  allowed: boolean,
  reason: AccessDecision['reason'],
): AccessDecision => ({ allowed, reason });

type LessonRow = [
  name: string,
  user: AccessUser | null,
  lesson: AccessLesson,
  level: AccessLevel,
  enrollment: AccessEnrollment | null,
  expected: AccessDecision,
];

describe('decideLesson', () => {
  const rows: LessonRow[] = [
    // administrators see everything
    [
      'admin, live lesson',
      admin,
      lesson.live,
      level.published,
      null,
      decision(true, 'admin'),
    ],
    [
      'admin, draft lesson',
      admin,
      lesson.draft,
      level.published,
      null,
      decision(true, 'admin'),
    ],
    [
      'admin, archived lesson',
      admin,
      lesson.archived,
      level.published,
      null,
      decision(true, 'admin'),
    ],
    [
      'admin, draft level',
      admin,
      lesson.live,
      level.draft,
      null,
      decision(true, 'admin'),
    ],
    [
      'admin, archived level',
      admin,
      lesson.live,
      level.archivedPublished,
      null,
      decision(true, 'admin'),
    ],

    // lessons that are not live are unavailable to everyone else
    [
      'anonymous, unpublished lesson',
      null,
      lesson.draft,
      level.published,
      null,
      decision(false, 'unavailable'),
    ],
    [
      'anonymous, unpublished free preview',
      null,
      lesson.draftPreview,
      level.published,
      null,
      decision(false, 'unavailable'),
    ],
    [
      'student, archived lesson',
      student,
      lesson.archived,
      level.published,
      null,
      decision(false, 'unavailable'),
    ],
    [
      'anonymous, archived free preview',
      null,
      lesson.archivedPreview,
      level.published,
      null,
      decision(false, 'unavailable'),
    ],
    [
      'enrolled, unpublished lesson',
      student,
      lesson.draft,
      level.published,
      active,
      decision(false, 'unavailable'),
    ],
    [
      'enrolled, archived lesson',
      student,
      lesson.archived,
      level.published,
      active,
      decision(false, 'unavailable'),
    ],

    // free previews on publicly visible levels
    [
      'anonymous, free preview',
      null,
      lesson.preview,
      level.published,
      null,
      decision(true, 'free-preview'),
    ],
    [
      'student, free preview',
      student,
      lesson.preview,
      level.published,
      null,
      decision(true, 'free-preview'),
    ],
    [
      'revoked student, free preview',
      student,
      lesson.preview,
      level.published,
      revoked,
      decision(true, 'free-preview'),
    ],
    [
      'anonymous, free preview on archived level',
      null,
      lesson.preview,
      level.archivedPublished,
      null,
      decision(false, 'login-required'),
    ],
    [
      'student, free preview on archived level',
      student,
      lesson.preview,
      level.archivedUnpublished,
      null,
      decision(false, 'not-enrolled'),
    ],
    [
      'anonymous, free preview on draft level',
      null,
      lesson.preview,
      level.draft,
      null,
      decision(false, 'unavailable'),
    ],
    [
      'student, free preview on draft level',
      student,
      lesson.preview,
      level.draft,
      null,
      decision(false, 'unavailable'),
    ],

    // enrollments
    [
      'enrolled, live lesson',
      student,
      lesson.live,
      level.published,
      active,
      decision(true, 'enrolled'),
    ],
    [
      'enrolled, free preview',
      student,
      lesson.preview,
      level.published,
      active,
      decision(true, 'enrolled'),
    ],
    [
      'enrolled, archived published level',
      student,
      lesson.live,
      level.archivedPublished,
      active,
      decision(true, 'enrolled'),
    ],
    [
      'enrolled, archived unpublished level',
      student,
      lesson.live,
      level.archivedUnpublished,
      active,
      decision(true, 'enrolled'),
    ],
    [
      'enrolled, free preview on archived level',
      student,
      lesson.preview,
      level.archivedPublished,
      active,
      decision(true, 'enrolled'),
    ],
    [
      'enrolled, unpublished non-archived level',
      student,
      lesson.live,
      level.draft,
      active,
      decision(false, 'unavailable'),
    ],
    [
      'revoked, live lesson',
      student,
      lesson.live,
      level.published,
      revoked,
      decision(false, 'not-enrolled'),
    ],
    [
      'revoked, archived level',
      student,
      lesson.live,
      level.archivedPublished,
      revoked,
      decision(false, 'not-enrolled'),
    ],

    // everyone else
    [
      'anonymous, locked lesson',
      null,
      lesson.live,
      level.published,
      null,
      decision(false, 'login-required'),
    ],
    [
      'student, locked lesson',
      student,
      lesson.live,
      level.published,
      null,
      decision(false, 'not-enrolled'),
    ],
    [
      'anonymous, lesson of archived level',
      null,
      lesson.live,
      level.archivedPublished,
      null,
      decision(false, 'login-required'),
    ],
    [
      'student, lesson of archived level',
      student,
      lesson.live,
      level.archivedPublished,
      null,
      decision(false, 'not-enrolled'),
    ],
    [
      'anonymous, lesson of draft level',
      null,
      lesson.live,
      level.draft,
      null,
      decision(false, 'unavailable'),
    ],
    [
      'student, lesson of draft level',
      student,
      lesson.live,
      level.draft,
      null,
      decision(false, 'unavailable'),
    ],
  ];

  it.each(rows)(
    '%s',
    (_name, user, lessonRow, levelRow, enrollment, expected) => {
      expect(
        decideLesson({ user, lesson: lessonRow, level: levelRow, enrollment }),
      ).toEqual(expected);
    },
  );
});

describe('decideLevel', () => {
  type LevelRow = [
    name: string,
    user: AccessUser | null,
    level: AccessLevel,
    enrollment: AccessEnrollment | null,
    expected: AccessDecision,
  ];
  const rows: LevelRow[] = [
    ['admin, draft level', admin, level.draft, null, decision(true, 'admin')],
    [
      'admin, archived level',
      admin,
      level.archivedPublished,
      null,
      decision(true, 'admin'),
    ],
    [
      'enrolled, published',
      student,
      level.published,
      active,
      decision(true, 'enrolled'),
    ],
    [
      'enrolled, archived',
      student,
      level.archivedPublished,
      active,
      decision(true, 'enrolled'),
    ],
    [
      'enrolled, archived and unpublished',
      student,
      level.archivedUnpublished,
      active,
      decision(true, 'enrolled'),
    ],
    [
      'enrolled, draft',
      student,
      level.draft,
      active,
      decision(false, 'unavailable'),
    ],
    [
      'revoked, published',
      student,
      level.published,
      revoked,
      decision(false, 'not-enrolled'),
    ],
    [
      'revoked, draft',
      student,
      level.draft,
      revoked,
      decision(false, 'unavailable'),
    ],
    [
      'student, published',
      student,
      level.published,
      null,
      decision(false, 'not-enrolled'),
    ],
    [
      'anonymous, published',
      null,
      level.published,
      null,
      decision(false, 'login-required'),
    ],
    [
      'anonymous, archived',
      null,
      level.archivedPublished,
      null,
      decision(false, 'login-required'),
    ],
    [
      'anonymous, draft',
      null,
      level.draft,
      null,
      decision(false, 'unavailable'),
    ],
    [
      'student, draft',
      student,
      level.draft,
      null,
      decision(false, 'unavailable'),
    ],
  ];

  it.each(rows)('%s', (_name, user, levelRow, enrollment, expected) => {
    expect(decideLevel({ user, level: levelRow, enrollment })).toEqual(
      expected,
    );
  });
});
