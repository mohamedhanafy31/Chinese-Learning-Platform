import {
  createLessonRequestSchema,
  createLevelRequestSchema,
  reorderRequestSchema,
  updateLessonRequestSchema,
  updateLevelRequestSchema,
  type CreateLessonRequest,
  type CreateLevelRequest,
  type ReorderRequest,
  type UpdateLessonRequest,
  type UpdateLevelRequest,
} from '@app/shared';

export class CreateLevelDto implements CreateLevelRequest {
  static readonly schema = createLevelRequestSchema;

  declare slug: CreateLevelRequest['slug'];
  declare hanzi: CreateLevelRequest['hanzi'];
  declare title: CreateLevelRequest['title'];
  declare summary: CreateLevelRequest['summary'];
  declare topics: CreateLevelRequest['topics'];
  declare priceMinor: CreateLevelRequest['priceMinor'];
  declare coverImageId: CreateLevelRequest['coverImageId'];
}

export class UpdateLevelDto implements UpdateLevelRequest {
  static readonly schema = updateLevelRequestSchema;

  declare slug?: UpdateLevelRequest['slug'];
  declare hanzi?: UpdateLevelRequest['hanzi'];
  declare title?: UpdateLevelRequest['title'];
  declare summary?: UpdateLevelRequest['summary'];
  declare topics?: UpdateLevelRequest['topics'];
  declare priceMinor?: UpdateLevelRequest['priceMinor'];
  declare coverImageId?: UpdateLevelRequest['coverImageId'];
}

export class CreateLessonDto implements CreateLessonRequest {
  static readonly schema = createLessonRequestSchema;

  declare title: CreateLessonRequest['title'];
  declare description: CreateLessonRequest['description'];
  declare hanzi: CreateLessonRequest['hanzi'];
  declare isFreePreview: CreateLessonRequest['isFreePreview'];
  declare thumbnailId: CreateLessonRequest['thumbnailId'];
}

export class UpdateLessonDto implements UpdateLessonRequest {
  static readonly schema = updateLessonRequestSchema;

  declare title?: UpdateLessonRequest['title'];
  declare description?: UpdateLessonRequest['description'];
  declare hanzi?: UpdateLessonRequest['hanzi'];
  declare isFreePreview?: UpdateLessonRequest['isFreePreview'];
  declare thumbnailId?: UpdateLessonRequest['thumbnailId'];
}

export class ReorderDto implements ReorderRequest {
  static readonly schema = reorderRequestSchema;

  declare ids: ReorderRequest['ids'];
}
