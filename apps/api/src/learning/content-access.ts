import { Role } from '@app/shared';

/**
 * The pure decision core of content access. Nothing here touches the database:
 * callers load the rows and hand them in, so every branch is table-testable.
 * `ContentAccessPolicy` (content-access.policy.ts) is the thin service that
 * loads the rows. Playback, streaming, quiz attempts and progress must all go
 * through these functions rather than re-deriving access.
 */

export interface AccessUser {
  id: string;
  role: Role;
}

export interface AccessLevel {
  isPublished: boolean;
  archivedAt: Date | null;
}

export interface AccessLesson {
  isPublished: boolean;
  archivedAt: Date | null;
  isFreePreview: boolean;
}

export interface AccessEnrollment {
  revokedAt: Date | null;
}

export type AccessReason =
  | 'admin'
  | 'free-preview'
  | 'enrolled'
  | 'not-enrolled'
  | 'unavailable'
  | 'login-required'
  | 'sequence-locked';

export interface AccessDecision {
  allowed: boolean;
  reason: AccessReason;
  /** For `sequence-locked`: the earlier lesson the learner must finish first. */
  requiredLessonId?: string;
}

export interface LessonAccessInput {
  user: AccessUser | null;
  lesson: AccessLesson;
  level: AccessLevel;
  enrollment: AccessEnrollment | null;
  /**
   * The earlier lesson an enrolled learner has not completed yet (see
   * `firstIncompleteLesson`), or null/absent when nothing blocks them. Only an
   * enrollment is ever held back by it: admins and free previews are not.
   */
  requiredLessonId?: string | null;
}

export type LevelAccessInput = Omit<LessonAccessInput, 'lesson'>;

const allow = (reason: AccessReason): AccessDecision => ({
  allowed: true,
  reason,
});
const deny = (reason: AccessReason): AccessDecision => ({
  allowed: false,
  reason,
});
const denySequence = (requiredLessonId: string): AccessDecision => ({
  allowed: false,
  reason: 'sequence-locked',
  requiredLessonId,
});

/** Published and not archived: the level the public catalog shows. */
export function isLevelPubliclyVisible(level: AccessLevel): boolean {
  return level.isPublished && level.archivedAt === null;
}

/**
 * Buyers keep archived levels, so a level stays readable for its enrollees
 * while it is published or archived. Only a level that is unpublished and not
 * archived (a draft, or a level pulled back) is unavailable to them.
 */
export function isLevelReadableByEnrollees(level: AccessLevel): boolean {
  return level.isPublished || level.archivedAt !== null;
}

export function isActiveEnrollment(
  enrollment: AccessEnrollment | null,
): enrollment is AccessEnrollment {
  return enrollment !== null && enrollment.revokedAt === null;
}

function withoutAccess(user: AccessUser | null): AccessDecision {
  return deny(user ? 'not-enrolled' : 'login-required');
}

/** May this user read the level's lessons (as an owner, or as staff)? */
export function decideLevel({
  user,
  level,
  enrollment,
}: LevelAccessInput): AccessDecision {
  if (user?.role === Role.ADMIN) return allow('admin');
  if (isActiveEnrollment(enrollment) && isLevelReadableByEnrollees(level)) {
    return allow('enrolled');
  }
  if (!isLevelReadableByEnrollees(level)) return deny('unavailable');
  return withoutAccess(user);
}

/**
 * May this user open this lesson? Order matters:
 * admins see everything; lessons that are not live are unavailable to everyone
 * else; an active enrollment opens the lesson (even on an archived level); a
 * free preview on a publicly visible level opens for anyone, anonymous included.
 *
 * Sequential unlocking (decision 4) applies to an active enrollment only. The
 * sequence is the ordered list of the level's visible lessons; a free preview
 * lesson is outside the lock (always open, and never required before a later
 * lesson), and any other lesson opens once every earlier non-preview lesson is
 * completed. Callers pass the first such incomplete lesson as
 * `requiredLessonId`; admins and previews ignore it.
 */
export function decideLesson({
  user,
  lesson,
  level,
  enrollment,
  requiredLessonId,
}: LessonAccessInput): AccessDecision {
  if (user?.role === Role.ADMIN) return allow('admin');
  if (!lesson.isPublished || lesson.archivedAt !== null) {
    return deny('unavailable');
  }
  if (isActiveEnrollment(enrollment) && isLevelReadableByEnrollees(level)) {
    if (requiredLessonId && !lesson.isFreePreview) {
      return denySequence(requiredLessonId);
    }
    return allow('enrolled');
  }
  if (lesson.isFreePreview && isLevelPubliclyVisible(level)) {
    return allow('free-preview');
  }
  if (!isLevelReadableByEnrollees(level)) return deny('unavailable');
  return withoutAccess(user);
}

// ---------------------------------------------------------------------------
// Sequential unlocking
// ---------------------------------------------------------------------------

/**
 * `done`: completed. `next`: where the learner continues. `open-preview`: an
 * incomplete free preview, open whatever came before. `locked`: waits for an
 * earlier lesson.
 */
export type SequenceState = 'done' | 'next' | 'open-preview' | 'locked';

/**
 * The state of every visible lesson for an enrolled learner. `lessons` is the
 * level's visible (published, not archived) lessons in order.
 *
 * Free previews (decision 6) sit outside the lock: they are always open, they
 * do not have to be completed before the lessons after them, but they count
 * toward the level's progress once the learner completes them. So `next` is
 * the first incomplete non-preview lesson; only when every non-preview lesson
 * is done does an incomplete preview become `next`, so a finished level has no
 * `next` at all. Every other incomplete non-preview lesson is `locked`.
 */
export function sequenceState(
  lessons: readonly { id: string }[],
  completedIds: ReadonlySet<string>,
  previewIds: ReadonlySet<string>,
): { id: string; state: SequenceState }[] {
  const gate = lessons.find(
    ({ id }) => !completedIds.has(id) && !previewIds.has(id),
  )?.id;
  const lastResort = gate
    ? undefined
    : lessons.find(({ id }) => !completedIds.has(id))?.id;
  return lessons.map(({ id }) => {
    if (completedIds.has(id)) return { id, state: 'done' };
    if (id === gate || id === lastResort) return { id, state: 'next' };
    return { id, state: previewIds.has(id) ? 'open-preview' : 'locked' };
  });
}

/**
 * The lesson an enrolled learner must complete before opening a non-preview
 * lesson: the first incomplete non-preview lesson in `earlier` (the visible
 * lessons before it, in order), or null when none is left.
 */
export function firstIncompleteLesson(
  earlier: readonly { id: string; isFreePreview: boolean }[],
  completedIds: ReadonlySet<string>,
): string | null {
  return (
    earlier.find(
      ({ id, isFreePreview }) => !isFreePreview && !completedIds.has(id),
    )?.id ?? null
  );
}

/**
 * What one lesson is called on a path, for the learner viewing it. Staff see
 * `open`; an enrolled learner sees the sequence (`done`, `next`, `preview` for
 * a later free preview, `locked`); everyone else sees `preview` or `locked`.
 */
export function pathAccess(
  decision: AccessDecision,
  sequence: SequenceState | undefined,
): LessonAccessLabel {
  if (!decision.allowed) return 'locked';
  if (decision.reason === 'admin') return 'open';
  if (decision.reason === 'enrolled' && sequence) {
    switch (sequence) {
      case 'done':
        return 'done';
      case 'next':
        return 'next';
      case 'open-preview':
        return 'preview';
      case 'locked':
        return 'locked';
    }
  }
  return decision.reason === 'free-preview' ? 'preview' : 'open';
}

export type LessonAccessLabel = 'open' | 'preview' | 'locked' | 'done' | 'next';
