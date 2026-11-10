import {
  Controller,
  Get,
  Inject,
  Param,
  UseInterceptors,
} from '@nestjs/common';
import type {
  LevelAccessResponse,
  MyLevelDetail,
  MyLevelsResponse,
  PublicUser,
} from '@app/shared';

import { LearningReadService } from './learning-read.service';
import {
  ADMIN_CACHE_CONTROL,
  CacheControlInterceptor,
} from '../catalog/cache-control.interceptor';
import {
  CurrentUser,
  OptionalUser,
} from '../common/decorators/current-user.decorator';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator';

/** Per-user responses are never cached by browsers or shared caches. */
const PRIVATE_NO_STORE = ADMIN_CACHE_CONTROL;

@Controller('me')
@UseInterceptors(new CacheControlInterceptor(PRIVATE_NO_STORE))
export class MyLevelsController {
  constructor(
    @Inject(LearningReadService) private readonly learning: LearningReadService,
  ) {}

  @Get('levels')
  list(@CurrentUser() user: PublicUser): Promise<MyLevelsResponse> {
    return this.learning.myLevels(user.id);
  }

  @Get('levels/:slug')
  get(
    @CurrentUser() user: PublicUser,
    @Param('slug') slug: string,
  ): Promise<MyLevelDetail> {
    return this.learning.myLevel(user.id, slug);
  }
}

@Controller('catalog')
@OptionalAuth()
@UseInterceptors(new CacheControlInterceptor(PRIVATE_NO_STORE))
export class LevelAccessController {
  constructor(
    @Inject(LearningReadService) private readonly learning: LearningReadService,
  ) {}

  @Get('levels/:slug/access')
  access(
    @OptionalUser() user: PublicUser | null,
    @Param('slug') slug: string,
  ): Promise<LevelAccessResponse> {
    return this.learning.levelAccess(user, slug);
  }
}
