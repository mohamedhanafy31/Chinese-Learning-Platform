import {
  adminQuestionSchema,
  adminQuizDetailSchema,
  adminQuizSummarySchema,
  attemptSnapshotSchema,
  learnerQuestionSchema,
  type AdminQuestion,
  type AdminQuizDetail,
  type AdminQuizSummary,
  type AttemptSnapshot,
  type LearnerQuestion,
  type QuestionImage,
} from '@app/shared';

import {
  parseLocalizedText,
  parseOptionalLocalizedText,
} from '../catalog/catalog.mapper';
import type {
  MediaAsset,
  Option,
  Question,
  Quiz,
} from '../generated/prisma/client';
import { mediaUrl } from '../media/media-url';

export type QuestionRow = Question & {
  options: Option[];
  image: MediaAsset | null;
};

export interface QuizStats {
  questionCount: number;
  totalPoints: number;
  attemptCount: number;
}

/** Prisma `include` for a question with everything the mappers need. */
export const questionInclude = {
  image: true,
  options: { orderBy: { sortOrder: 'asc' } },
} as const;

export function toQuestionImage(
  row: MediaAsset | null | undefined,
): QuestionImage | null {
  return row
    ? {
        id: row.id,
        url: mediaUrl(row.storageKey),
        width: row.width,
        height: row.height,
      }
    : null;
}

export function toAdminQuizSummary(
  row: Quiz,
  stats: QuizStats,
): AdminQuizSummary {
  return adminQuizSummarySchema.parse({
    id: row.id,
    lessonId: row.lessonId,
    title: parseLocalizedText(row.title),
    description: parseOptionalLocalizedText(row.description),
    passingScore: row.passingScore,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    questionCount: stats.questionCount,
    totalPoints: stats.totalPoints,
    attemptCount: stats.attemptCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function toAdminQuestion(row: QuestionRow): AdminQuestion {
  return adminQuestionSchema.parse({
    id: row.id,
    quizId: row.quizId,
    type: row.type,
    prompt: parseLocalizedText(row.prompt),
    hanzi: row.hanzi,
    imageId: row.imageId,
    image: toQuestionImage(row.image),
    explanation: parseOptionalLocalizedText(row.explanation),
    points: row.points,
    sortOrder: row.sortOrder,
    options: row.options.map((option) => ({
      id: option.id,
      text: parseLocalizedText(option.text),
      isCorrect: option.isCorrect,
      sortOrder: option.sortOrder,
    })),
  });
}

export function toAdminQuizDetail(
  row: Quiz,
  questions: QuestionRow[],
  attemptCount: number,
): AdminQuizDetail {
  return adminQuizDetailSchema.parse({
    ...toAdminQuizSummary(row, {
      questionCount: questions.length,
      totalPoints: questions.reduce((sum, q) => sum + q.points, 0),
      attemptCount,
    }),
    questions: questions.map(toAdminQuestion),
  });
}

/**
 * The explicit learner shape. It is built field by field and parsed through a
 * schema that has no `isCorrect` or `explanation`, so neither can leak.
 */
export function toLearnerQuestion(row: QuestionRow): LearnerQuestion {
  return learnerQuestionSchema.parse({
    id: row.id,
    type: row.type,
    prompt: parseLocalizedText(row.prompt),
    hanzi: row.hanzi,
    image: toQuestionImage(row.image),
    points: row.points,
    options: shuffled(row.options).map((option) => ({
      id: option.id,
      text: parseLocalizedText(option.text),
    })),
  });
}

/**
 * Learners see choices in a random order so the position of the right answer
 * cannot be memorised across attempts. Two-option questions keep their
 * authored order (e.g. true/false); grading and snapshots use option ids.
 */
function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  if (result.length <= 2) return result;
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** DB JSON is never trusted: the stored snapshot is parsed on the way out. */
export function parseSnapshot(value: unknown): AttemptSnapshot {
  return attemptSnapshotSchema.parse(value);
}
