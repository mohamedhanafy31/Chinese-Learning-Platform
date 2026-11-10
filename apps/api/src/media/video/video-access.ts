import type { AccessDecision } from '../../learning/content-access';
import { assertLessonAccess } from '../../learning/lesson-access';

/**
 * The playback descriptor and the byte stream answer a `ContentAccessPolicy`
 * decision the same way as every lesson-bound feature (see
 * `assertLessonAccess`), with video-specific wording.
 */
export function assertWatchable(
  decision: AccessDecision,
  levelSlug: string,
): void {
  assertLessonAccess(decision, levelSlug, {
    loginRequired: 'Sign in to watch this lesson',
    notEnrolled: 'This lesson is part of a level you are not enrolled in',
  });
}
