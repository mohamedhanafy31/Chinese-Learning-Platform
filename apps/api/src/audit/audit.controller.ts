import {
  Controller,
  Get,
  Inject,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { Role, type AdminAuditResponse } from '@app/shared';

import { AdminAuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';
import {
  ADMIN_CACHE_CONTROL,
  CacheControlInterceptor,
} from '../catalog/cache-control.interceptor';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';

/** Read-only by design: there is no route that edits or removes a row. */
@Controller('admin/audit')
@Roles(Role.ADMIN)
@UseInterceptors(new CacheControlInterceptor(ADMIN_CACHE_CONTROL))
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(AdminAuditQueryDto.schema))
    query: AdminAuditQueryDto,
  ): Promise<AdminAuditResponse> {
    return this.audit.list(query);
  }
}
