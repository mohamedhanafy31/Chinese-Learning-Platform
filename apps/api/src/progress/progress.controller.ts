import { createHash } from 'node:crypto';

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ProgressReportResponse, PublicUser } from '@app/shared';

import { ReportProgressDto } from './progress.dto';
import { ProgressService } from './progress.service';
import {
  ADMIN_CACHE_CONTROL,
  CacheControlInterceptor,
} from '../catalog/cache-control.interceptor';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';

/** Progress reports per learner and minute (a flush every 10 s needs ~6). */
export const PROGRESS_REPORTS_PER_MINUTE = 120;

/**
 * The throttler runs before authentication, so the bucket is keyed on a hash
 * of the access-token cookie (one per session) and falls back to the IP.
 * Several learners behind one address then never share a bucket.
 */
function progressTracker(request: Record<string, unknown>): string {
  const cookies = request.cookies as { access_token?: unknown } | undefined;
  const token = cookies?.access_token;
  if (typeof token === 'string' && token.length > 0) {
    return `progress:${createHash('sha256').update(token).digest('hex')}`;
  }
  const ip = typeof request.ip === 'string' ? request.ip : 'unknown';
  return `progress:ip:${ip}`;
}

@Controller('lessons')
@UseInterceptors(new CacheControlInterceptor(ADMIN_CACHE_CONTROL))
export class ProgressController {
  constructor(
    @Inject(ProgressService) private readonly progress: ProgressService,
  ) {}

  /** Reports watched ranges; the policy decides whether the lesson is open. */
  @Post(':id/progress')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: PROGRESS_REPORTS_PER_MINUTE,
      ttl: 60_000,
      getTracker: progressTracker,
    },
  })
  report(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ReportProgressDto.schema))
    input: ReportProgressDto,
  ): Promise<ProgressReportResponse> {
    return this.progress.report(user, id, input);
  }
}
