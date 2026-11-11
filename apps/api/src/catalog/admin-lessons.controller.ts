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
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { Role, type AdminLesson, type PublicUser } from '@app/shared';

import { CatalogAdminService } from './catalog-admin.service';
import {
  ADMIN_CACHE_CONTROL,
  CacheControlInterceptor,
} from './cache-control.interceptor';
import { UpdateLessonDto } from './catalog.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';

@Controller('admin/lessons')
@Roles(Role.ADMIN)
@UseInterceptors(new CacheControlInterceptor(ADMIN_CACHE_CONTROL))
export class AdminLessonsController {
  constructor(
    @Inject(CatalogAdminService) private readonly catalog: CatalogAdminService,
  ) {}

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminLesson> {
    return this.catalog.getLesson(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateLessonDto.schema))
    input: UpdateLessonDto,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminLesson> {
    return this.catalog.updateLesson(id, input, admin.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: PublicUser,
  ): Promise<void> {
    return this.catalog.deleteLesson(id, admin.id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminLesson> {
    return this.catalog.publishLesson(id, admin.id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminLesson> {
    return this.catalog.unpublishLesson(id, admin.id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminLesson> {
    return this.catalog.archiveLesson(id, admin.id);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  unarchive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminLesson> {
    return this.catalog.unarchiveLesson(id, admin.id);
  }
}
