import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type LessonProgress as LessonProgressView,
  type ProgressReportResponse,
  type PublicUser,
  type ReportProgressRequest,
} from '@app/shared';

import { isLessonComplete, isVideoWatched, watchedPercent } from './completion';
import { applyReport, coverage, parseRanges, type Range } from './segments';
import type { Prisma } from '../generated/prisma/client';
import type { LessonProgress } from '../generated/prisma/client';
import { sequenceState } from '../learning/content-access';
import { ContentAccessPolicy } from '../learning/content-access.policy';
import { assertLessonAccess } from '../learning/lesson-access';
import { PrismaService } from '../prisma/prisma.service';

/** A segment may overshoot the duration by this much (rounding, player drift). */
export const DURATION_TOLERANCE_SECONDS = 2;
const MIN_DURATION = 1;
const MAX_DURATION = 36_000;

type Db = Prisma.TransactionClient | PrismaService;

interface LessonContext {
  levelId: string;
  levelSlug: string;
  hasVideo: boolean;
  /** The active asset's length in whole seconds, when it knows it. */
  assetDuration: number | null;
  /** Live quizzes: not archived and with at least one question. */
  quizIds: string[];
}

function clampDuration(value: number): number {
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(value)));
}

/**
 * Watch coverage, completion and the learner's place in a level's sequence.
 *
 * Completion (decision 5): a lesson is complete when its video is at least
 * 90 % covered AND every live quiz has a passing attempt; no video means
 * quizzes only, no quizzes means video only, neither completes when an enrolled
 * learner opens it. `completedAt` is sticky on purpose: once earned it stays,
 * even if an admin later adds a quiz or replaces the video, so a learner never
 * loses a lesson (or the next lesson's unlock) to a content edit.
 */
@Injectable()
export class ProgressService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ContentAccessPolicy) private readonly policy: ContentAccessPolicy,
  ) {}

  // ----- the progress endpoint ---------------------------------------------

  async report(
    user: PublicUser,
    lessonId: string,
    input: ReportProgressRequest,
  ): Promise<ProgressReportResponse> {
    const context = await this.context(this.prisma, lessonId);
    const decision = await this.policy.forLesson(user, lessonId);
    assertLessonAccess(decision, context.levelSlug, {
      loginRequired: 'Sign in to save your progress',
      notEnrolled: 'This lesson is part of a level you are not enrolled in',
    });

    const row = await this.prisma.$transaction(async (tx) => {
      // The row exists and is locked before it is read, so two reports of one
      // learner (the periodic flush and a pagehide beacon) apply in turn and
      // each sees the other's coverage and `lastReportAt`.
      await tx.lessonProgress.upsert({
        where: { userId_lessonId: { userId: user.id, lessonId } },
        create: { userId: user.id, lessonId },
        update: {},
      });
      await tx.$queryRaw`SELECT 1 FROM "LessonProgress" WHERE "userId" = ${user.id}::uuid AND "lessonId" = ${lessonId}::uuid FOR UPDATE`;
      const current = await tx.lessonProgress.findUniqueOrThrow({
        where: { userId_lessonId: { userId: user.id, lessonId } },
      });
      const passed = await this.passedCount(tx, user.id, context.quizIds);

      const now = new Date();
      const patch: Prisma.LessonProgressUpdateInput = {
        lastReportAt: now,
      };
      let state = current;
      if (context.hasVideo) {
        const duration = this.resolveDuration(context, current, input);
        const segments = this.acceptSegments(current, input, duration, now);
        const watched = Math.round(coverage(segments));
        const videoCompletedAt =
          current.videoCompletedAt ??
          (isVideoWatched(watched, duration) ? now : null);
        Object.assign(patch, {
          watchedSegments: segments as unknown as Prisma.InputJsonValue,
          watchedSec: watched,
          durationSec: duration,
          lastPositionSec: Math.min(
            Math.max(0, Math.floor(input.positionSec)),
            duration,
          ),
          videoCompletedAt,
        });
        state = {
          ...current,
          watchedSec: watched,
          durationSec: duration,
          videoCompletedAt,
        };
      }
      // A lesson with neither a video nor a quiz completes when an enrolled
      // learner's lesson page reports that it was opened (an explicit POST
      // from the browser, never a GET that a link prefetch could trigger).
      const complete =
        this.isComplete(state, context, passed) ||
        (decision.reason === 'enrolled' && hasNoRequirements(context));
      if (complete && current.completedAt === null) patch.completedAt = now;
      return tx.lessonProgress.update({
        where: { userId_lessonId: { userId: user.id, lessonId } },
        data: patch,
      });
    });

    const sequence = await this.sequence(this.prisma, user.id, context.levelId);
    return {
      watchedPercent: watchedPercent(row.watchedSec, row.durationSec ?? 0),
      videoComplete: row.videoCompletedAt !== null,
      complete: row.completedAt !== null,
      nextLessonId: continueAfter(
        sequence.lessons,
        sequence.completed,
        lessonId,
      ),
    };
  }

  /**
   * Re-evaluates one lesson right after something that can complete it (a
   * passing quiz attempt). Cheap and idempotent.
   */
  async reevaluate(userId: string, lessonId: string): Promise<void> {
    const context = await this.context(this.prisma, lessonId);
    await this.prisma.$transaction(async (tx) => {
      await tx.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: { userId, lessonId },
        update: {},
      });
      await tx.$queryRaw`SELECT 1 FROM "LessonProgress" WHERE "userId" = ${userId}::uuid AND "lessonId" = ${lessonId}::uuid FOR UPDATE`;
      const row = await tx.lessonProgress.findUniqueOrThrow({
        where: { userId_lessonId: { userId, lessonId } },
      });
      if (row.completedAt !== null) return;
      const passed = await this.passedCount(tx, userId, context.quizIds);
      if (this.isComplete(row, context, passed)) {
        await tx.lessonProgress.update({
          where: { userId_lessonId: { userId, lessonId } },
          data: { completedAt: new Date() },
        });
      }
    });
  }

  // ----- reading -----------------------------------------------------------

  /**
   * The learner's progress on one lesson, for the playback descriptor. Read
   * only: GETs are prefetched by Next links, so nothing is completed here (a
   * lesson without requirements completes through `report`).
   */
  async lessonView(
    userId: string,
    lessonId: string,
  ): Promise<LessonProgressView> {
    const context = await this.context(this.prisma, lessonId);
    const row = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    const passed = await this.passedCount(this.prisma, userId, context.quizIds);
    const sequence = await this.sequence(this.prisma, userId, context.levelId);
    const duration = row?.durationSec ?? context.assetDuration ?? 0;
    return {
      watchedPercent: watchedPercent(row?.watchedSec ?? 0, duration),
      lastPositionSec: row?.lastPositionSec ?? 0,
      videoComplete: row?.videoCompletedAt != null,
      complete: row?.completedAt != null,
      quizzes: { total: context.quizIds.length, passed },
      hasVideo: context.hasVideo,
      nextLessonId: continueAfter(
        sequence.lessons,
        sequence.completed,
        lessonId,
      ),
    };
  }

  /**
   * The visible lessons of a level in order, and which of them the learner
   * completed. The input of every sequence decision.
   */
  async levelSequence(userId: string, levelId: string) {
    return this.sequence(this.prisma, userId, levelId);
  }

  /** Completed lesson ids of one learner, across the given levels' lessons. */
  async completedLessonIds(
    userId: string,
    lessonIds: readonly string[],
  ): Promise<Set<string>> {
    if (lessonIds.length === 0) return new Set();
    const rows = await this.prisma.lessonProgress.findMany({
      where: {
        userId,
        lessonId: { in: [...lessonIds] },
        completedAt: { not: null },
      },
      select: { lessonId: true },
    });
    return new Set(rows.map(({ lessonId }) => lessonId));
  }

  // ----- internals ---------------------------------------------------------

  private async context(db: Db, lessonId: string): Promise<LessonContext> {
    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      select: {
        levelId: true,
        level: { select: { slug: true } },
        activeVideo: { select: { durationSec: true } },
      },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const quizzes = await db.quiz.findMany({
      where: { lessonId, archivedAt: null, questions: { some: {} } },
      select: { id: true },
    });
    const assetDuration = lesson.activeVideo?.durationSec ?? null;
    return {
      levelId: lesson.levelId,
      levelSlug: lesson.level.slug,
      hasVideo: lesson.activeVideo !== null,
      assetDuration: assetDuration && assetDuration > 0 ? assetDuration : null,
      quizIds: quizzes.map(({ id }) => id),
    };
  }

  /** How many of the live quizzes have at least one passing attempt. */
  private async passedCount(
    db: Db,
    userId: string,
    quizIds: readonly string[],
  ): Promise<number> {
    if (quizIds.length === 0) return 0;
    const rows = await db.quizAttempt.findMany({
      where: { userId, quizId: { in: [...quizIds] }, passed: true },
      distinct: ['quizId'],
      select: { quizId: true },
    });
    return rows.length;
  }

  private isComplete(
    row: Pick<
      LessonProgress,
      'watchedSec' | 'durationSec' | 'videoCompletedAt'
    >,
    context: LessonContext,
    passed: number,
  ): boolean {
    const quizzes = context.quizIds.map((_, index) => ({
      passed: index < passed,
    }));
    // A lesson with neither a video nor a quiz is only completed by an
    // enrolled learner's opening report (see `report`), never here.
    if (hasNoRequirements(context)) return false;
    return isLessonComplete({
      // Once the video was fully watched it stays satisfied.
      hasVideo: context.hasVideo && row.videoCompletedAt === null,
      videoCovered: row.watchedSec,
      duration: row.durationSec ?? context.assetDuration ?? 0,
      quizzes,
    });
  }

  /** The asset's length, else the player's (stored once, clamped 1..36000). */
  private resolveDuration(
    context: LessonContext,
    row: LessonProgress,
    input: ReportProgressRequest,
  ): number {
    if (context.assetDuration !== null) return context.assetDuration;
    if (row.durationSec !== null) return row.durationSec;
    if (input.durationSec === undefined || input.durationSec <= 0) {
      throw new BadRequestException(
        'durationSec is required until the video has a known length',
      );
    }
    return clampDuration(input.durationSec);
  }

  /**
   * Merges what the player reports into the stored coverage. A segment outside
   * `[0, duration]` is a 400. New coverage is capped at the time since the last
   * report plus 15 s (30 s for the first report), so a client cannot claim the
   * whole video in one request; already-watched ranges add nothing.
   */
  private acceptSegments(
    row: LessonProgress,
    input: ReportProgressRequest,
    duration: number,
    now: Date,
  ): Range[] {
    for (const [from, to] of input.segments) {
      if (to < from || to > duration + DURATION_TOLERANCE_SECONDS) {
        throw new BadRequestException(
          'A reported segment lies outside the video',
        );
      }
    }
    return applyReport({
      stored: parseRanges(row.watchedSegments),
      reported: input.segments,
      duration,
      sinceLastReportSec: row.lastReportAt
        ? (now.getTime() - row.lastReportAt.getTime()) / 1000
        : null,
      sinceFirstReportSec: (now.getTime() - row.createdAt.getTime()) / 1000,
    });
  }

  private async sequence(db: Db, userId: string, levelId: string) {
    const lessons = await db.lesson.findMany({
      where: { levelId, isPublished: true, archivedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, isFreePreview: true },
    });
    const done = await db.lessonProgress.findMany({
      where: {
        userId,
        lessonId: { in: lessons.map(({ id }) => id) },
        completedAt: { not: null },
      },
      select: { lessonId: true },
    });
    return {
      lessons,
      completed: new Set(done.map(({ lessonId }) => lessonId)),
    };
  }
}

/**
 * Where the learner continues once they leave `lessonId`: the sequence's `next`
 * lesson, or null when that is this very lesson (not done yet) or nothing is
 * left. The lesson page only offers it once the lesson is complete.
 */
export function continueAfter(
  lessons: readonly { id: string; isFreePreview: boolean }[],
  completed: ReadonlySet<string>,
  lessonId: string,
): string | null {
  const next = sequenceState(
    lessons,
    completed,
    new Set(lessons.filter((lesson) => lesson.isFreePreview).map((l) => l.id)),
  ).find(({ state }) => state === 'next');
  return next && next.id !== lessonId ? next.id : null;
}

/** Neither a video nor a live quiz: nothing to watch or pass. */
function hasNoRequirements(context: {
  hasVideo: boolean;
  quizIds: readonly string[];
}): boolean {
  return !context.hasVideo && context.quizIds.length === 0;
}
