import type { PrismaClient } from '../src/generated/prisma/client';

/** Adds the smallest live quiz that satisfies the lesson publish policy. */
export async function makeLessonPublishable(
  prisma: PrismaClient,
  lessonId: string,
): Promise<string> {
  const existing = await prisma.quiz.findFirst({
    where: { lessonId, archivedAt: null, questions: { some: {} } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const quiz = await prisma.quiz.create({
    data: {
      lessonId,
      title: { en: 'Publish readiness' },
      sortOrder: (await prisma.quiz.count({ where: { lessonId } })) + 1,
    },
  });
  await prisma.question.create({
    data: {
      quizId: quiz.id,
      type: 'TRUE_FALSE',
      prompt: { en: 'Ready?' },
      sortOrder: 1,
    },
  });
  return quiz.id;
}

export async function archivePublishableContent(
  prisma: PrismaClient,
  quizId: string,
): Promise<void> {
  // Deleted rather than archived so unrelated quiz counts and lists are
  // untouched; its questions cascade.
  await prisma.quiz.delete({ where: { id: quizId } });
}

/** Seeds an already-published child without adding unrelated audit events. */
export async function makeLevelPublishable(
  prisma: PrismaClient,
  levelId: string,
): Promise<string> {
  const existing = await prisma.lesson.findFirst({
    where: { levelId },
    orderBy: { sortOrder: 'asc' },
  });
  const lesson =
    existing ??
    (await prisma.lesson.create({
      data: {
        levelId,
        title: { en: 'Publish readiness' },
        sortOrder: 1,
      },
    }));
  const quizId = await makeLessonPublishable(prisma, lesson.id);
  await prisma.lesson.update({
    where: { id: lesson.id },
    data: { isPublished: true, archivedAt: null },
  });
  await archivePublishableContent(prisma, quizId);
  return lesson.id;
}
