import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import type { AccessDecision } from './content-access';

export interface LessonAccessMessages {
  loginRequired: string;
  notEnrolled: string;
}

const DEFAULT_MESSAGES: LessonAccessMessages = {
  loginRequired: 'Sign in to open this lesson',
  notEnrolled: 'This lesson is part of a level you are not enrolled in',
};

/**
 * Maps a `ContentAccessPolicy` decision onto the HTTP answer shared by every
 * lesson-bound feature (video playback and streaming, quizzes): unavailable is
 * a 404 (the lesson is not revealed), signed-out is a 401, signed-in without
 * access is a 403 that names the level so the UI can offer its page.
 */
export function assertLessonAccess(
  decision: AccessDecision,
  levelSlug: string,
  messages: LessonAccessMessages = DEFAULT_MESSAGES,
): void {
  if (decision.allowed) return;
  switch (decision.reason) {
    case 'login-required':
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: messages.loginRequired,
        reason: 'login-required',
      });
    case 'not-enrolled':
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: messages.notEnrolled,
        reason: 'not-enrolled',
        levelSlug,
      });
    default:
      throw new NotFoundException('Lesson not found');
  }
}
