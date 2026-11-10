import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  Role,
  type AdminStudentDetail,
  type AdminStudentsResponse,
  type PublicUser,
} from '@app/shared';

import { AdminStudentsService } from './admin-students.service';
import {
  AdminStudentsQueryDto,
  GrantEnrollmentDto,
  RevokeEnrollmentDto,
} from './learning.dto';
import {
  ADMIN_CACHE_CONTROL,
  CacheControlInterceptor,
} from '../catalog/cache-control.interceptor';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';

@Controller('admin/students')
@Roles(Role.ADMIN)
@UseInterceptors(new CacheControlInterceptor(ADMIN_CACHE_CONTROL))
export class AdminStudentsController {
  constructor(
    @Inject(AdminStudentsService)
    private readonly students: AdminStudentsService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(AdminStudentsQueryDto.schema))
    query: AdminStudentsQueryDto,
  ): Promise<AdminStudentsResponse> {
    return this.students.list(query);
  }

  @Get(':id')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AdminStudentDetail> {
    return this.students.get(id);
  }

  @Post(':id/enrollments')
  grant(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(GrantEnrollmentDto.schema))
    input: GrantEnrollmentDto,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminStudentDetail> {
    return this.students.grant(id, input.levelId, admin.id);
  }

  @Delete(':id/enrollments/:levelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('levelId', new ParseUUIDPipe()) levelId: string,
    @Body(new ZodValidationPipe(RevokeEnrollmentDto.schema))
    input: RevokeEnrollmentDto,
    @CurrentUser() admin: PublicUser,
  ): Promise<void> {
    return this.students.revoke(id, levelId, admin.id, input.reason);
  }
}
