import {
  Controller,
  Get,
  Inject,
  Param,
  UseInterceptors,
} from '@nestjs/common';
import type { PublicLevelDetail, PublicLevelsResponse } from '@app/shared';

import { CatalogPublicService } from './catalog-public.service';
import {
  CacheControlInterceptor,
  PUBLIC_CACHE_CONTROL,
} from './cache-control.interceptor';
import { Public } from '../common/decorators/public.decorator';

@Controller('catalog')
@Public()
@UseInterceptors(new CacheControlInterceptor(PUBLIC_CACHE_CONTROL))
export class PublicCatalogController {
  constructor(
    @Inject(CatalogPublicService)
    private readonly catalog: CatalogPublicService,
  ) {}

  @Get('levels')
  listLevels(): Promise<PublicLevelsResponse> {
    return this.catalog.listLevels();
  }

  @Get('levels/:slug')
  getLevel(@Param('slug') slug: string): Promise<PublicLevelDetail> {
    return this.catalog.getLevel(slug);
  }
}
