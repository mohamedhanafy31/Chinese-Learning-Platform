export interface PublishChecklist {
  required: boolean;
  recommended: [boolean, boolean];
}

export function levelPublishReadiness(level: {
  coverImageId: string | null;
  topics: unknown[];
  lessons: Array<{ isPublished: boolean; archivedAt: string | null }>;
}): PublishChecklist {
  return {
    required: level.lessons.some(
      (lesson) => lesson.isPublished && lesson.archivedAt === null,
    ),
    recommended: [level.coverImageId !== null, level.topics.length > 0],
  };
}

export function lessonPublishReadiness(
  lesson: {
    description: unknown | null;
    thumbnailId: string | null;
    video: { status: string } | null;
  },
  quizzes: Array<{ archivedAt: string | null; questionCount: number }>,
): PublishChecklist {
  return {
    required:
      lesson.video?.status === 'READY' ||
      quizzes.some(
        (quiz) => quiz.archivedAt === null && quiz.questionCount > 0,
      ),
    recommended: [lesson.description !== null, lesson.thumbnailId !== null],
  };
}
