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
  Put,
  UseInterceptors,
} from '@nestjs/common';
import {
  Role,
  type AdminLesson,
  type AdminLevel,
  type AdminLevelDetail,
  type AdminLevelsResponse,
} from '@app/shared';

import { CatalogAdminService } from './catalog-admin.service';
import {
  ADMIN_CACHE_CONTROL,
  CacheControlInterceptor,
} from './cache-control.interceptor';
import {
  CreateLessonDto,
  CreateLevelDto,
  ReorderDto,
  UpdateLevelDto,
} from './catalog.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';

@Controller('admin/levels')
@Roles(Role.ADMIN)
@UseInterceptors(new CacheControlInterceptor(ADMIN_CACHE_CONTROL))
export class AdminLevelsController {
  constructor(
    @Inject(CatalogAdminService) private readonly catalog: CatalogAdminService,
  ) {}

  @Get()
  list(): Promise<AdminLevelsResponse> {
    return this.catalog.listLevels();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateLevelDto.schema)) input: CreateLevelDto,
  ): Promise<AdminLevel> {
    return this.catalog.createLevel(input);
  }

  // Declared before the ":id" routes so "order" is never read as an id.
  @Put('order')
  reorder(
    @Body(new ZodValidationPipe(ReorderDto.schema)) input: ReorderDto,
  ): Promise<AdminLevelsResponse> {
    return this.catalog.reorderLevels(input.ids);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminLevelDetail> {
    return this.catalog.getLevel(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateLevelDto.schema)) input: UpdateLevelDto,
  ): Promise<AdminLevel> {
    return this.catalog.updateLevel(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.catalog.deleteLevel(id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminLevel> {
    return this.catalog.publishLevel(id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminLevel> {
    return this.catalog.unpublishLevel(id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminLevel> {
    return this.catalog.archiveLevel(id);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  unarchive(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminLevel> {
    return this.catalog.unarchiveLevel(id);
  }

  @Post(':id/lessons')
  createLesson(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CreateLessonDto.schema)) input: CreateLessonDto,
  ): Promise<AdminLesson> {
    return this.catalog.createLesson(id, input);
  }

  @Put(':id/lessons/order')
  reorderLessons(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ReorderDto.schema)) input: ReorderDto,
  ): Promise<{ lessons: AdminLesson[] }> {
    return this.catalog
      .reorderLessons(id, input.ids)
      .then((lessons) => ({ lessons }));
  }
}
