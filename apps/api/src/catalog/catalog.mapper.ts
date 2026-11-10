import {
  adminLessonSchema,
  adminLevelSchema,
  levelTopicsSchema,
  localizedTextSchema,
  type AdminLesson,
  type AdminLevel,
  type LocalizedText,
  type PublicLesson,
  type PublicLevel,
} from '@app/shared';

import type {
  Lesson,
  Level,
  MediaAsset,
  VideoAsset,
} from '../generated/prisma/client';
import { toImageRef } from '../media/media-url';
import { toAdminVideo, toPendingVideo } from '../media/video/video-mapper';

export type LevelRow = Level & { coverImage: MediaAsset | null };
export type LessonRow = Lesson & { thumbnail: MediaAsset | null };
export type AdminLessonRow = LessonRow & {
  activeVideo: VideoAsset | null;
  videos: VideoAsset[];
};

/** Prisma `include` fragments that keep rows compatible with the mappers. */
export const levelImageInclude = { coverImage: true } as const;
export const lessonImageInclude = { thumbnail: true } as const;
/** The admin also sees each lesson's active video and its unfinished uploads. */
export const lessonAdminInclude = {
  thumbnail: true,
  activeVideo: true,
  videos: {
    where: { status: { not: 'READY' } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  },
} as const;

/** DB JSON is never trusted: it is parsed again on the way out. */
export function parseLocalizedText(value: unknown): LocalizedText {
  return localizedTextSchema.parse(value);
}

export function parseOptionalLocalizedText(
  value: unknown,
): LocalizedText | null {
  return value === null || value === undefined
    ? null
    : localizedTextSchema.parse(value);
}

export function parseTopics(value: unknown): LocalizedText[] {
  return levelTopicsSchema.parse(value);
}

export function toAdminLesson(row: AdminLessonRow): AdminLesson {
  return adminLessonSchema.parse({
    id: row.id,
    levelId: row.levelId,
    title: parseLocalizedText(row.title),
    description: parseOptionalLocalizedText(row.description),
    hanzi: row.hanzi,
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
    isFreePreview: row.isFreePreview,
    thumbnailId: row.thumbnailId,
    thumbnail: toImageRef(row.thumbnail),
    video: row.activeVideo ? toAdminVideo(row.activeVideo) : null,
    pendingVideo: toPendingVideo(row.videos, row.activeVideo),
    firstPublishedAt: row.firstPublishedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function toAdminLevel(row: LevelRow, lessonCount: number): AdminLevel {
  return adminLevelSchema.parse({
    id: row.id,
    slug: row.slug,
    hanzi: row.hanzi,
    title: parseLocalizedText(row.title),
    summary: parseLocalizedText(row.summary),
    topics: parseTopics(row.topics),
    priceMinor: row.priceMinor,
    currency: row.currency,
    coverImageId: row.coverImageId,
    coverImage: toImageRef(row.coverImage),
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
    firstPublishedAt: row.firstPublishedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lessonCount,
  });
}

/** Builds the explicit public shape; internal flags are never copied over. */
export function toPublicLevel(
  row: LevelRow,
  number: number,
  lessonCount: number,
): PublicLevel {
  return {
    slug: row.slug,
    number,
    hanzi: row.hanzi,
    title: parseLocalizedText(row.title),
    summary: parseLocalizedText(row.summary),
    topics: parseTopics(row.topics),
    priceMinor: row.priceMinor,
    currency: row.currency,
    coverImage: toImageRef(row.coverImage),
    lessonCount,
  };
}

export function toPublicLesson(row: LessonRow, number: number): PublicLesson {
  return {
    id: row.id,
    number,
    title: parseLocalizedText(row.title),
    description: parseOptionalLocalizedText(row.description),
    hanzi: row.hanzi,
    isFreePreview: row.isFreePreview,
    thumbnail: toImageRef(row.thumbnail),
  };
}
