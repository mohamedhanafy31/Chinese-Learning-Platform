import { createHash } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AttemptDetail,
  AttemptsResponse,
  LearnerQuiz,
  LearnerQuizzesResponse,
  PublicUser,
  SubmitAttemptResponse,
} from '@app/shared';

import {
  ATTEMPTS_PER_MINUTE,
  AssessmentLearnerService,
} from './assessment-learner.service';
import { SubmitAttemptDto } from './assessment.dto';
import {
  ADMIN_CACHE_CONTROL,
  CacheControlInterceptor,
} from '../catalog/cache-control.interceptor';
import {
  CurrentUser,
  OptionalUser,
} from '../common/decorators/current-user.decorator';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';

const uuid = () => new ParseUUIDPipe();

/**
 * Throttle bucket per learner: the throttler runs before authentication, so
 * the bucket is keyed on a hash of the access-token cookie (one per session),
 * falling back to the IP. The service also enforces the same limit per user
 * from the stored attempts.
 */
function attemptTracker(request: Record<string, unknown>): string {
  const cookies = request.cookies as { access_token?: unknown } | undefined;
  const token = cookies?.access_token;
  if (typeof token === 'string' && token.length > 0) {
    return `quiz-attempt:${createHash('sha256').update(token).digest('hex')}`;
  }
  const ip = typeof request.ip === 'string' ? request.ip : 'unknown';
  return `quiz-attempt:ip:${ip}`;
}

/** Per-user responses are never cached by browsers or shared caches. */
@Controller()
@UseInterceptors(new CacheControlInterceptor(ADMIN_CACHE_CONTROL))
export class AssessmentLearnerController {
  constructor(
    @Inject(AssessmentLearnerService)
    private readonly assessment: AssessmentLearnerService,
  ) {}

  @Get('lessons/:lessonId/quizzes')
  @OptionalAuth()
  list(
    @OptionalUser() user: PublicUser | null,
    @Param('lessonId', uuid()) lessonId: string,
  ): Promise<LearnerQuizzesResponse> {
    return this.assessment.listForLesson(user, lessonId);
  }

  @Get('quizzes/:id')
  @OptionalAuth()
  get(
    @OptionalUser() user: PublicUser | null,
    @Param('id', uuid()) id: string,
  ): Promise<LearnerQuiz> {
    return this.assessment.getForTaking(user, id);
  }

  /** 10 attempts per minute per learner; the 11th is a 429. */
  @Post('quizzes/:id/attempts')
  @Throttle({
    default: {
      limit: ATTEMPTS_PER_MINUTE,
      ttl: 60_000,
      getTracker: attemptTracker,
    },
  })
  submit(
    @CurrentUser() user: PublicUser,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(SubmitAttemptDto.schema))
    input: SubmitAttemptDto,
  ): Promise<SubmitAttemptResponse> {
    return this.assessment.submitAttempt(user, id, input);
  }

  @Get('quizzes/:id/attempts')
  attempts(
    @CurrentUser() user: PublicUser,
    @Param('id', uuid()) id: string,
  ): Promise<AttemptsResponse> {
    return this.assessment.listAttempts(user.id, id);
  }

  @Get('attempts/:id')
  attempt(
    @CurrentUser() user: PublicUser,
    @Param('id', uuid()) id: string,
  ): Promise<AttemptDetail> {
    return this.assessment.getAttempt(user, id);
  }
}
