import { Controller, Get, Inject, UseInterceptors } from '@nestjs/common';
import { Role, type AdminOverview } from '@app/shared';

import { OverviewService } from './overview.service';
import {
  ADMIN_CACHE_CONTROL,
  CacheControlInterceptor,
} from '../catalog/cache-control.interceptor';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin/overview')
@Roles(Role.ADMIN)
@UseInterceptors(new CacheControlInterceptor(ADMIN_CACHE_CONTROL))
export class OverviewController {
  constructor(
    @Inject(OverviewService) private readonly overview: OverviewService,
  ) {}

  @Get()
  get(): Promise<AdminOverview> {
    return this.overview.overview();
  }
}
