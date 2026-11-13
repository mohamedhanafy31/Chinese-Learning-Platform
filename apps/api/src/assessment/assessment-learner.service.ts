import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Role,
  type AttemptDetail,
  type AttemptsResponse,
  type LearnerQuiz,
  type LearnerQuizzesResponse,
  type PublicUser,
  type SubmitAttemptRequest,
  type SubmitAttemptResponse,
} from '@app/shared';

import {
  parseSnapshot,
  questionInclude,
  toLearnerQuestion,
} from './assessment.mapper';
import {
  buildSnapshot,
  grade,
  hasPassed,
  validateAnswers,
} from './quiz-grading';
import {
  parseLocalizedText,
  parseOptionalLocalizedText,
} from '../catalog/catalog.mapper';
import { Prisma } from '../generated/prisma/client';
import type { QuizAttempt } from '../generated/prisma/client';
import { ContentAccessPolicy } from '../learning/content-access.policy';
import { assertLessonAccess } from '../learning/lesson-access';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';

/** Attempts one learner may submit per rolling minute, across all quizzes. */
export const ATTEMPTS_PER_MINUTE = 10;
const ATTEMPT_WINDOW_MS = 60_000;

export function toAttemptSummary(row: QuizAttempt) {
  return {
    id: row.id,
    score: row.score,
    earnedPoints: row.earnedPoints,
    totalPoints: row.totalPoints,
    passed: row.passed,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AssessmentLearnerService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ContentAccessPolicy) private readonly policy: ContentAccessPolicy,
    @Inject(ProgressService) private readonly progress: ProgressService,
  ) {}

  /** Live quizzes of one lesson, with the signed-in learner's progress on each. */
  async listForLesson(
    user: PublicUser | null,
    lessonId: string,
  ): Promise<LearnerQuizzesResponse> {
    await this.assertLessonOpen(user, lessonId);
    const rows = await this.prisma.quiz.findMany({
      where: { lessonId, archivedAt: null, questions: { some: {} } },
      orderBy: { sortOrder: 'asc' },
    });
    const ids = rows.map((row) => row.id);
    const [totals, counts, bests] = await Promise.all([
      this.prisma.question.groupBy({
        by: ['quizId'],
        where: { quizId: { in: ids } },
        _count: { _all: true },
        _sum: { points: true },
      }),
      user
        ? this.prisma.quizAttempt.groupBy({
            by: ['quizId'],
            where: { userId: user.id, quizId: { in: ids } },
            _count: { _all: true },
          })
        : [],
      user
        ? this.prisma.quizAttempt.findMany({
            where: { userId: user.id, quizId: { in: ids } },
            orderBy: [
              { score: 'desc' },
              { passed: 'desc' },
              { createdAt: 'desc' },
            ],
            distinct: ['quizId'],
          })
        : [],
    ]);
    const totalOf = new Map(totals.map((row) => [row.quizId, row]));
    const countOf = new Map(counts.map((row) => [row.quizId, row._count._all]));
    const bestOf = new Map(bests.map((row) => [row.quizId, row]));

    return {
      quizzes: rows.map((row) => {
        const total = totalOf.get(row.id);
        const best = bestOf.get(row.id);
        return {
          id: row.id,
          title: parseLocalizedText(row.title),
          description: parseOptionalLocalizedText(row.description),
          passingScore: row.passingScore,
          questionCount: total?._count._all ?? 0,
          totalPoints: total?._sum.points ?? 0,
          best: best
            ? {
                score: best.score,
                passed: best.passed,
                createdAt: best.createdAt.toISOString(),
              }
            : null,
          attempts: countOf.get(row.id) ?? 0,
        };
      }),
    };
  }

  /** The quiz for taking: no `isCorrect`, no explanations. */
  async getForTaking(
    user: PublicUser | null,
    id: string,
  ): Promise<LearnerQuiz> {
    const quiz = await this.findOpenQuiz(user, id, true);
    const questions = await this.prisma.question.findMany({
      where: { quizId: id },
      orderBy: { sortOrder: 'asc' },
      include: questionInclude,
    });
    if (questions.length === 0) throw new NotFoundException('Quiz not found');
    return {
      id: quiz.id,
      lessonId: quiz.lessonId,
      title: parseLocalizedText(quiz.title),
      description: parseOptionalLocalizedText(quiz.description),
      passingScore: quiz.passingScore,
      questionCount: questions.length,
      totalPoints: questions.reduce((sum, q) => sum + q.points, 0),
      questions: questions.map(toLearnerQuestion),
    };
  }

  async submitAttempt(
    user: PublicUser,
    id: string,
    input: SubmitAttemptRequest,
  ): Promise<SubmitAttemptResponse> {
    const openQuiz = await this.findOpenQuiz(user, id, false);
    await this.assertWithinRate(user.id);

    try {
      const response = await this.prisma.$transaction(async (tx) => {
        // Read inside the transaction so grading and the snapshot see the
        // same questions, even if an admin edits the quiz meanwhile.
        const quiz = await tx.quiz.findUnique({ where: { id } });
        if (!quiz || quiz.archivedAt)
          throw new NotFoundException('Quiz not found');
        const questions = await tx.question.findMany({
          where: { quizId: id },
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        });
        if (questions.length === 0) {
          throw new NotFoundException('Quiz not found');
        }

        const problems = validateAnswers(questions, input.answers);
        if (problems.length > 0) {
          throw new BadRequestException({
            message: 'Invalid answers',
            issues: problems,
          });
        }

        const result = grade(questions, input.answers);
        const passed = hasPassed(result.score, quiz.passingScore);
        const snapshot = buildSnapshot(
          quiz.passingScore,
          questions.map((question) => ({
            id: question.id,
            type: question.type,
            points: question.points,
            prompt: parseLocalizedText(question.prompt),
            hanzi: question.hanzi,
            explanation: parseOptionalLocalizedText(question.explanation),
            options: question.options.map((option) => ({
              id: option.id,
              isCorrect: option.isCorrect,
              text: parseLocalizedText(option.text),
            })),
          })),
          result.outcomes,
        );
        const attempt = await tx.quizAttempt.create({
          data: {
            userId: user.id,
            quizId: id,
            score: result.score,
            earnedPoints: result.earnedPoints,
            totalPoints: result.totalPoints,
            passed,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
          },
        });
        return {
          attempt: toAttemptSummary(attempt),
          results: snapshot.questions.map((question) => ({
            questionId: question.id,
            correct: question.correct,
            chosen: question.chosen,
            ...(passed
              ? {
                  correctOptionIds: question.options
                    .filter((option) => option.isCorrect)
                    .map((option) => option.id),
                  explanation: question.explanation,
                }
              : {}),
          })),
        };
      });
      // A passing attempt may complete the lesson (and unlock the next one),
      // so it is re-evaluated in this same request.
      if (response.attempt.passed) {
        await this.progress.reevaluate(user.id, openQuiz.lessonId);
      }
      return response;
    } catch (error) {
      // The quiz was deleted between the access check and the insert.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('Quiz not found');
      }
      throw error;
    }
  }

  /**
   * The learner's own history for one quiz, newest first. It is the learner's
   * own data, so it needs no content access: it stays readable after the quiz
   * was archived or the enrollment revoked.
   */
  async listAttempts(
    userId: string,
    quizId: string,
  ): Promise<AttemptsResponse> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: { id: true },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    const rows = await this.prisma.quizAttempt.findMany({
      where: { userId, quizId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return { attempts: rows.map(toAttemptSummary) };
  }

  /**
   * One attempt rendered from its stored snapshot, so it reads the same after
   * the quiz is edited, archived or the enrollment revoked. Other learners'
   * attempts are a 404; admins may read any.
   */
  async getAttempt(user: PublicUser, id: string): Promise<AttemptDetail> {
    const row = await this.prisma.quizAttempt.findUnique({ where: { id } });
    if (!row || (row.userId !== user.id && user.role !== Role.ADMIN)) {
      throw new NotFoundException('Attempt not found');
    }
    const snapshot = parseSnapshot(row.snapshot);
    return {
      attempt: {
        ...toAttemptSummary(row),
        quizId: row.quizId,
        passingScore: snapshot.passingScore,
      },
      questions:
        row.passed || user.role === Role.ADMIN
          ? snapshot.questions
          : snapshot.questions.map((question) => ({
              id: question.id,
              type: question.type,
              prompt: question.prompt,
              hanzi: question.hanzi,
              points: question.points,
              chosen: question.chosen,
              correct: question.correct,
              options: question.options.map(({ id, text }) => ({ id, text })),
            })),
    };
  }

  // ----- helpers -----------------------------------------------------------

  private async assertLessonOpen(
    user: PublicUser | null,
    lessonId: string,
  ): Promise<void> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { level: { select: { slug: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    assertLessonAccess(
      await this.policy.forLesson(user, lessonId),
      lesson.level.slug,
    );
  }

  /**
   * Loads a quiz the user may open: the lesson passes the access policy and the
   * quiz is not archived (admins may still read archived quizzes).
   */
  private async findOpenQuiz(
    user: PublicUser | null,
    id: string,
    adminMayReadArchived: boolean,
  ) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: { lesson: { select: { level: { select: { slug: true } } } } },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    assertLessonAccess(
      await this.policy.forLesson(user, quiz.lessonId),
      quiz.lesson.level.slug,
    );
    const mayReadArchived = adminMayReadArchived && user?.role === Role.ADMIN;
    if (quiz.archivedAt && !mayReadArchived) {
      throw new NotFoundException('Quiz not found');
    }
    return quiz;
  }

  /** Authoritative per-user limit; the route's `@Throttle` is the cheap first gate. */
  private async assertWithinRate(userId: string): Promise<void> {
    const recent = await this.prisma.quizAttempt.count({
      where: {
        userId,
        createdAt: { gt: new Date(Date.now() - ATTEMPT_WINDOW_MS) },
      },
    });
    if (recent >= ATTEMPTS_PER_MINUTE) {
      throw new HttpException(
        'Too Many Requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
