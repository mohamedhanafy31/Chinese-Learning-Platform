import type { PrismaClient } from '../src/generated/prisma/client';
import { catalogSeed } from './seed-data';

/**
 * Idempotent: levels are upserted by slug and lessons by (level, sortOrder).
 * Re-running refreshes content but never touches publish state, price or order
 * of rows that already exist.
 */
export async function seedCatalog(prisma: PrismaClient): Promise<void> {
  const now = new Date();
  for (const [levelIndex, level] of catalogSeed.entries()) {
    const content = {
      hanzi: level.hanzi,
      title: level.title,
      summary: level.summary,
      topics: level.topics,
    };
    const row = await prisma.level.upsert({
      where: { slug: level.slug },
      create: {
        slug: level.slug,
        ...content,
        priceMinor: level.priceMinor,
        sortOrder: levelIndex + 1,
        isPublished: true,
        firstPublishedAt: now,
      },
      update: content,
    });

    for (const [lessonIndex, lesson] of level.lessons.entries()) {
      const lessonContent = { title: lesson.title, hanzi: lesson.hanzi };
      await prisma.lesson.upsert({
        where: {
          levelId_sortOrder: { levelId: row.id, sortOrder: lessonIndex + 1 },
        },
        create: {
          levelId: row.id,
          ...lessonContent,
          sortOrder: lessonIndex + 1,
          isPublished: true,
          firstPublishedAt: now,
        },
        update: lessonContent,
      });
    }
  }
}
