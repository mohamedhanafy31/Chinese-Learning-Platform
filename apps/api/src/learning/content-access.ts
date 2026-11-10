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
  | 'login-required';

export interface AccessDecision {
  allowed: boolean;
  reason: AccessReason;
}

export interface LessonAccessInput {
  user: AccessUser | null;
  lesson: AccessLesson;
  level: AccessLevel;
  enrollment: AccessEnrollment | null;
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
 */
export function decideLesson({
  user,
  lesson,
  level,
  enrollment,
}: LessonAccessInput): AccessDecision {
  if (user?.role === Role.ADMIN) return allow('admin');
  if (!lesson.isPublished || lesson.archivedAt !== null) {
    return deny('unavailable');
  }
  if (isActiveEnrollment(enrollment) && isLevelReadableByEnrollees(level)) {
    return allow('enrolled');
  }
  if (lesson.isFreePreview && isLevelPubliclyVisible(level)) {
    return allow('free-preview');
  }
  if (!isLevelReadableByEnrollees(level)) return deny('unavailable');
  return withoutAccess(user);
}
