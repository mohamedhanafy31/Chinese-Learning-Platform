import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { Role, type AdminLesson } from '@app/shared';

import { CatalogAdminService } from './catalog-admin.service';
import {
  ADMIN_CACHE_CONTROL,
  CacheControlInterceptor,
} from './cache-control.interceptor';
import { UpdateLessonDto } from './catalog.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';

@Controller('admin/lessons')
@Roles(Role.ADMIN)
@UseInterceptors(new CacheControlInterceptor(ADMIN_CACHE_CONTROL))
export class AdminLessonsController {
  constructor(
    @Inject(CatalogAdminService) private readonly catalog: CatalogAdminService,
  ) {}

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateLessonDto.schema))
    input: UpdateLessonDto,
  ): Promise<AdminLesson> {
    return this.catalog.updateLesson(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.catalog.deleteLesson(id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminLesson> {
    return this.catalog.publishLesson(id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AdminLesson> {
    return this.catalog.unpublishLesson(id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminLesson> {
    return this.catalog.archiveLesson(id);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  unarchive(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AdminLesson> {
    return this.catalog.unarchiveLesson(id);
  }
}
