import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  AdminQuestion,
  AdminQuizDetail,
  AdminQuizSummary,
  AdminQuizzesResponse,
  CreateQuizRequest,
  QuestionRequest,
  UpdateQuizRequest,
} from '@app/shared';

import {
  lockQuizRow,
  lockScope,
  questionsLockKey,
  quizzesLockKey,
} from './assessment-locks';
import {
  questionInclude,
  toAdminQuestion,
  toAdminQuizDetail,
  toAdminQuizSummary,
  type QuizStats,
} from './assessment.mapper';
import { INVALID_OPTIONS_REASON, resolveOptions } from './quiz-rules';
import { diffAudit, diffData } from '../audit/audit-diff';
import { AuditService } from '../audit/audit.service';
import { assertCompleteOrder } from '../catalog/catalog-order';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export const HAS_ATTEMPTS_REASON = 'has-attempts';
export const INVALID_IMAGE_REASON = 'invalid-image';

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function optionalJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : toJson(value);
}

/**
 * Rule violations answer 422 with `{ reason, message }` (reasons:
 * `invalid-options`, `invalid-image`), next to 400 for malformed bodies.
 */
function unprocessable(reason: string, message: string): never {
  throw new UnprocessableEntityException({
    statusCode: 422,
    error: 'Unprocessable Entity',
    message,
    reason,
  });
}

@Injectable()
export class AssessmentAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ----- quizzes -----------------------------------------------------------

  async listQuizzes(lessonId: string): Promise<AdminQuizzesResponse> {
    await this.findLessonOrThrow(this.prisma, lessonId);
    const rows = await this.prisma.quiz.findMany({
      where: { lessonId },
      orderBy: { sortOrder: 'asc' },
    });
    const stats = await this.statsFor(
      this.prisma,
      rows.map((row) => row.id),
    );
    return {
      quizzes: rows.map((row) => toAdminQuizSummary(row, stats.get(row.id)!)),
    };
  }

  createQuiz(
    lessonId: string,
    input: CreateQuizRequest,
    actorId: string,
  ): Promise<AdminQuizSummary> {
    return this.prisma.$transaction(async (tx) => {
      await lockScope(tx, quizzesLockKey(lessonId));
      await this.findLessonOrThrow(tx, lessonId);
      // Archived quizzes keep their slot, so the next slot is after all of them.
      const { _max } = await tx.quiz.aggregate({
        where: { lessonId },
        _max: { sortOrder: true },
      });
      const row = await tx.quiz.create({
        data: {
          lessonId,
          title: toJson(input.title),
          description: optionalJson(input.description),
          passingScore: input.passingScore,
          sortOrder: (_max.sortOrder ?? 0) + 1,
        },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'quiz.create',
        entity: 'Quiz',
        entityId: row.id,
        data: { lessonId, passingScore: row.passingScore },
      });
      return toAdminQuizSummary(row, {
        questionCount: 0,
        totalPoints: 0,
        attemptCount: 0,
      });
    });
  }

  async getQuiz(id: string): Promise<AdminQuizDetail> {
    const row = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { sortOrder: 'asc' }, include: questionInclude },
        _count: { select: { attempts: true } },
      },
    });
    if (!row) throw new NotFoundException('Quiz not found');
    const { questions, _count, ...quiz } = row;
    return toAdminQuizDetail(quiz, questions, _count.attempts);
  }

  updateQuiz(
    id: string,
    input: UpdateQuizRequest,
    actorId: string,
  ): Promise<AdminQuizSummary> {
    return this.prisma.$transaction(async (tx) => {
      await lockQuizRow(tx, id);
      const current = await this.findQuizOrThrow(tx, id);
      const row = await tx.quiz.update({
        where: { id },
        data: {
          title: input.title ? toJson(input.title) : undefined,
          description:
            input.description === undefined
              ? undefined
              : optionalJson(input.description),
          passingScore: input.passingScore,
        },
      });
      const diff = diffAudit(
        current,
        row,
        ['title', 'description', 'passingScore'],
        ['title', 'passingScore'],
      );
      if (diff.changed.length > 0) {
        await this.audit.record(tx, {
          actorId,
          action: 'quiz.update',
          entity: 'Quiz',
          entityId: id,
          data: diffData(diff),
        });
      }
      return this.summaryOf(tx, row);
    });
  }

  /**
   * The ids must be exactly the lesson's non-archived quizzes. They are placed
   * into the slots those quizzes already occupy (in ascending order), so the
   * slots held by archived quizzes are never touched and the unique index
   * holds. Two phases: park on negative values, then assign the final slots.
   */
  async reorderQuizzes(
    lessonId: string,
    ids: string[],
    actorId: string,
  ): Promise<AdminQuizzesResponse> {
    await this.prisma.$transaction(async (tx) => {
      await lockScope(tx, quizzesLockKey(lessonId));
      await this.findLessonOrThrow(tx, lessonId);
      const rows = await tx.quiz.findMany({
        where: { lessonId, archivedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, sortOrder: true },
      });
      assertCompleteOrder(
        rows.map((row) => row.id),
        ids,
      );
      const slots = rows.map((row) => row.sortOrder);
      for (const [index, id] of ids.entries()) {
        await tx.quiz.update({
          where: { id },
          data: { sortOrder: -(index + 1) },
        });
      }
      for (const [index, id] of ids.entries()) {
        await tx.quiz.update({
          where: { id },
          data: { sortOrder: slots[index] },
        });
      }
      await this.audit.record(tx, {
        actorId,
        action: 'quiz.reorder',
        entity: 'Lesson',
        entityId: lessonId,
        data: { order: ids },
      });
    });
    return this.listQuizzes(lessonId);
  }

  archiveQuiz(id: string, actorId: string): Promise<AdminQuizSummary> {
    return this.setArchived(
      id,
      actorId,
      'quiz.archive',
      (current) => current ?? new Date(),
    );
  }

  /**
   * Restoring clears `archivedAt` and keeps the quiz's own slot. Archived
   * quizzes keep their `sortOrder` and reorders never reuse it, so the slot is
   * always free and the quiz returns to where it was.
   */
  restoreQuiz(id: string, actorId: string): Promise<AdminQuizSummary> {
    return this.setArchived(id, actorId, 'quiz.restore', () => null);
  }

  async deleteQuiz(id: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const quiz = await this.findQuizOrThrow(tx, id);
      await lockScope(tx, quizzesLockKey(quiz.lessonId));
      // An attempt insert takes a share lock on the quiz row, so this lock
      // orders the delete and a concurrent attempt one way or the other.
      await lockQuizRow(tx, id);
      const attempts = await tx.quizAttempt.count({ where: { quizId: id } });
      if (attempts > 0) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message:
            'A quiz with attempts cannot be deleted. Archive it instead.',
          reason: HAS_ATTEMPTS_REASON,
        });
      }
      await tx.quiz.delete({ where: { id } });
      await this.audit.record(tx, {
        actorId,
        action: 'quiz.delete',
        entity: 'Quiz',
        entityId: id,
        data: { lessonId: quiz.lessonId },
      });
    });
  }

  // ----- questions ---------------------------------------------------------

  createQuestion(
    quizId: string,
    input: QuestionRequest,
    actorId: string,
  ): Promise<AdminQuestion> {
    return this.prisma.$transaction(async (tx) => {
      await lockScope(tx, questionsLockKey(quizId));
      await this.findQuizOrThrow(tx, quizId);
      const options = this.validate(input);
      await this.assertImage(tx, input.imageId);
      const { _max } = await tx.question.aggregate({
        where: { quizId },
        _max: { sortOrder: true },
      });
      const row = await tx.question.create({
        data: {
          quizId,
          type: input.type,
          prompt: toJson(input.prompt),
          hanzi: input.hanzi,
          imageId: input.imageId,
          explanation: optionalJson(input.explanation),
          points: input.points,
          sortOrder: (_max.sortOrder ?? 0) + 1,
          options: {
            create: options.map((option, index) => ({
              text: toJson(option.text),
              isCorrect: option.isCorrect,
              sortOrder: index + 1,
            })),
          },
        },
        include: questionInclude,
      });
      await this.audit.record(tx, {
        actorId,
        action: 'question.create',
        entity: 'Quiz',
        entityId: quizId,
        data: { questionId: row.id, type: row.type, points: row.points },
      });
      return toAdminQuestion(row);
    });
  }

  /** Replaces the question and all of its options in one transaction. */
  async replaceQuestion(
    id: string,
    input: QuestionRequest,
    actorId: string,
  ): Promise<AdminQuestion> {
    const found = await this.prisma.question.findUnique({
      where: { id },
      select: { quizId: true },
    });
    if (!found) throw new NotFoundException('Question not found');
    return this.prisma.$transaction(async (tx) => {
      await lockScope(tx, questionsLockKey(found.quizId));
      const current = await tx.question.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Question not found');
      const options = this.validate(input);
      await this.assertImage(tx, input.imageId);
      await tx.option.deleteMany({ where: { questionId: id } });
      const row = await tx.question.update({
        where: { id },
        data: {
          type: input.type,
          prompt: toJson(input.prompt),
          hanzi: input.hanzi,
          imageId: input.imageId,
          explanation: optionalJson(input.explanation),
          points: input.points,
          options: {
            create: options.map((option, index) => ({
              text: toJson(option.text),
              isCorrect: option.isCorrect,
              sortOrder: index + 1,
            })),
          },
        },
        include: questionInclude,
      });
      // Options are replaced wholesale, so they are named, never diffed.
      const diff = diffAudit(
        current,
        row,
        ['type', 'prompt', 'hanzi', 'imageId', 'explanation', 'points'],
        ['type', 'hanzi', 'imageId', 'points'],
      );
      await this.audit.record(tx, {
        actorId,
        action: 'question.update',
        entity: 'Quiz',
        entityId: found.quizId,
        data: { questionId: id, ...diffData(diff) },
      });
      return toAdminQuestion(row);
    });
  }

  /** Allowed even with attempts: their snapshots keep the history. */
  async deleteQuestion(id: string, actorId: string): Promise<void> {
    const found = await this.prisma.question.findUnique({
      where: { id },
      select: { quizId: true },
    });
    if (!found) throw new NotFoundException('Question not found');
    await this.prisma.$transaction(async (tx) => {
      await lockScope(tx, questionsLockKey(found.quizId));
      const { count } = await tx.question.deleteMany({ where: { id } });
      if (count > 0) {
        await this.audit.record(tx, {
          actorId,
          action: 'question.delete',
          entity: 'Quiz',
          entityId: found.quizId,
          data: { questionId: id },
        });
      }
    });
  }

  async reorderQuestions(
    quizId: string,
    ids: string[],
    actorId: string,
  ): Promise<AdminQuizDetail> {
    await this.prisma.$transaction(async (tx) => {
      await lockScope(tx, questionsLockKey(quizId));
      await this.findQuizOrThrow(tx, quizId);
      const rows = await tx.question.findMany({
        where: { quizId },
        select: { id: true },
      });
      assertCompleteOrder(
        rows.map((row) => row.id),
        ids,
      );
      for (const [index, id] of ids.entries()) {
        await tx.question.update({
          where: { id },
          data: { sortOrder: -(index + 1) },
        });
      }
      for (const [index, id] of ids.entries()) {
        await tx.question.update({
          where: { id },
          data: { sortOrder: index + 1 },
        });
      }
      await this.audit.record(tx, {
        actorId,
        action: 'question.reorder',
        entity: 'Quiz',
        entityId: quizId,
        data: { order: ids },
      });
    });
    return this.getQuiz(quizId);
  }

  // ----- helpers -----------------------------------------------------------

  private validate(input: QuestionRequest) {
    const resolved = resolveOptions(
      input.type,
      input.options,
      input.correctAnswer,
    );
    if (!resolved.ok) unprocessable(INVALID_OPTIONS_REASON, resolved.message);
    return resolved.options;
  }

  private async assertImage(
    tx: Tx,
    imageId: string | null | undefined,
  ): Promise<void> {
    if (!imageId) return;
    const asset = await tx.mediaAsset.findUnique({
      where: { id: imageId },
      select: { kind: true },
    });
    if (asset?.kind !== 'IMAGE') {
      unprocessable(INVALID_IMAGE_REASON, 'imageId must be an existing image');
    }
  }

  private async statsFor(
    tx: Tx | PrismaService,
    quizIds: string[],
  ): Promise<Map<string, QuizStats>> {
    const [questions, attempts] = await Promise.all([
      tx.question.groupBy({
        by: ['quizId'],
        where: { quizId: { in: quizIds } },
        _count: { _all: true },
        _sum: { points: true },
      }),
      tx.quizAttempt.groupBy({
        by: ['quizId'],
        where: { quizId: { in: quizIds } },
        _count: { _all: true },
      }),
    ]);
    const stats = new Map<string, QuizStats>(
      quizIds.map((id) => [
        id,
        { questionCount: 0, totalPoints: 0, attemptCount: 0 },
      ]),
    );
    for (const row of questions) {
      const entry = stats.get(row.quizId)!;
      entry.questionCount = row._count._all;
      entry.totalPoints = row._sum.points ?? 0;
    }
    for (const row of attempts) {
      stats.get(row.quizId)!.attemptCount = row._count._all;
    }
    return stats;
  }

  private async summaryOf(
    tx: Tx,
    row: Parameters<typeof toAdminQuizSummary>[0],
  ): Promise<AdminQuizSummary> {
    const stats = await this.statsFor(tx, [row.id]);
    return toAdminQuizSummary(row, stats.get(row.id)!);
  }

  private setArchived(
    id: string,
    actorId: string,
    action: string,
    next: (current: Date | null) => Date | null,
  ): Promise<AdminQuizSummary> {
    return this.prisma.$transaction(async (tx) => {
      const quiz = await this.findQuizOrThrow(tx, id);
      // The lesson scope lock keeps archive/restore from racing a reorder.
      await lockScope(tx, quizzesLockKey(quiz.lessonId));
      await lockQuizRow(tx, id);
      const current = await this.findQuizOrThrow(tx, id);
      const row = await tx.quiz.update({
        where: { id },
        data: { archivedAt: next(current.archivedAt) },
      });
      if ((current.archivedAt === null) !== (row.archivedAt === null)) {
        await this.audit.record(tx, {
          actorId,
          action,
          entity: 'Quiz',
          entityId: id,
          data: { lessonId: row.lessonId },
        });
      }
      return this.summaryOf(tx, row);
    });
  }

  private async findLessonOrThrow(tx: Tx | PrismaService, id: string) {
    const lesson = await tx.lesson.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  private async findQuizOrThrow(tx: Tx | PrismaService, id: string) {
    const quiz = await tx.quiz.findUnique({ where: { id } });
    if (!quiz) throw new NotFoundException('Quiz not found');
    return quiz;
  }
}
