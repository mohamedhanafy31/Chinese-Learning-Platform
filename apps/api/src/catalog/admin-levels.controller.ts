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
  type PublicUser,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
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
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminLevel> {
    return this.catalog.createLevel(input, admin.id);
  }

  // Declared before the ":id" routes so "order" is never read as an id.
  @Put('order')
  reorder(
    @Body(new ZodValidationPipe(ReorderDto.schema)) input: ReorderDto,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminLevelsResponse> {
    return this.catalog.reorderLevels(input.ids, admin.id);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminLevelDetail> {
    return this.catalog.getLevel(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateLevelDto.schema)) input: UpdateLevelDto,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminLevel> {
    return this.catalog.updateLevel(id, input, admin.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: PublicUser,
  ): Promise<void> {
    return this.catalog.deleteLevel(id, admin.id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminLevel> {
    return this.catalog.publishLevel(id, admin.id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminLevel> {
    return this.catalog.unpublishLevel(id, admin.id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminLevel> {
    return this.catalog.archiveLevel(id, admin.id);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  unarchive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminLevel> {
    return this.catalog.unarchiveLevel(id, admin.id);
  }

  @Post(':id/lessons')
  createLesson(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CreateLessonDto.schema)) input: CreateLessonDto,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminLesson> {
    return this.catalog.createLesson(id, input, admin.id);
  }

  @Put(':id/lessons/order')
  reorderLessons(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ReorderDto.schema)) input: ReorderDto,
    @CurrentUser() admin: PublicUser,
  ): Promise<{ lessons: AdminLesson[] }> {
    return this.catalog
      .reorderLessons(id, input.ids, admin.id)
      .then((lessons) => ({ lessons }));
  }
}
