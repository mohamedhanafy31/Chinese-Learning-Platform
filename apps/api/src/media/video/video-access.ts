import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import type { AccessDecision } from '../../learning/content-access';

/**
 * Maps a `ContentAccessPolicy` decision onto the HTTP answer shared by the
 * playback descriptor and the byte stream: unavailable is a 404 (the lesson is
 * not revealed), signed-out is a 401, signed-in without access is a 403 that
 * names the level so the UI can offer its page.
 */
export function assertWatchable(
  decision: AccessDecision,
  levelSlug: string,
): void {
  if (decision.allowed) return;
  switch (decision.reason) {
    case 'login-required':
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Sign in to watch this lesson',
        reason: 'login-required',
      });
    case 'not-enrolled':
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'This lesson is part of a level you are not enrolled in',
        reason: 'not-enrolled',
        levelSlug,
      });
    default:
      throw new NotFoundException('Lesson not found');
  }
}
