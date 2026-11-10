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

import type { Lesson, Level } from '../generated/prisma/client';

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

export function toAdminLesson(row: Lesson): AdminLesson {
  return adminLessonSchema.parse({
    id: row.id,
    levelId: row.levelId,
    title: parseLocalizedText(row.title),
    description: parseOptionalLocalizedText(row.description),
    hanzi: row.hanzi,
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
    isFreePreview: row.isFreePreview,
    firstPublishedAt: row.firstPublishedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function toAdminLevel(row: Level, lessonCount: number): AdminLevel {
  return adminLevelSchema.parse({
    id: row.id,
    slug: row.slug,
    hanzi: row.hanzi,
    title: parseLocalizedText(row.title),
    summary: parseLocalizedText(row.summary),
    topics: parseTopics(row.topics),
    priceMinor: row.priceMinor,
    currency: row.currency,
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
  row: Level,
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
    lessonCount,
  };
}

export function toPublicLesson(row: Lesson, number: number): PublicLesson {
  return {
    id: row.id,
    number,
    title: parseLocalizedText(row.title),
    description: parseOptionalLocalizedText(row.description),
    hanzi: row.hanzi,
    isFreePreview: row.isFreePreview,
  };
}
