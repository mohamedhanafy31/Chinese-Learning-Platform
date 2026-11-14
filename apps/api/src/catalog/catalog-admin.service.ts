import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminLesson,
  AdminLevel,
  AdminLevelDetail,
  AdminLevelsResponse,
  CreateLessonRequest,
  CreateLevelRequest,
  UpdateLessonRequest,
  UpdateLevelRequest,
} from '@app/shared';

import { diffAudit, diffData } from '../audit/audit-diff';
import { AuditService } from '../audit/audit.service';
import { assertCompleteOrder } from './catalog-order';
import {
  lessonAdminInclude,
  levelImageInclude,
  toAdminLesson,
  toAdminLevel,
} from './catalog.mapper';
import { Prisma } from '../generated/prisma/client';
import { VideoService } from '../media/video/video.service';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

const LEVELS_LOCK_KEY = 'catalog:levels';
const lessonsLockKey = (levelId: string): string =>
  `catalog:lessons:${levelId}`;

/**
 * Takes a transaction-level advisory lock. Every create, reorder and delete in
 * a scope takes the same lock, so appends and reorders can never interleave.
 */
async function lockScope(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/** Row lock so read-then-write state changes (publish, slug edit) serialise. */
async function lockLevelRow(tx: Tx, id: string): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM "Level" WHERE id = ${id}::uuid FOR UPDATE`;
}

async function lockLessonRow(tx: Tx, id: string): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM "Lesson" WHERE id = ${id}::uuid FOR UPDATE`;
}

async function lockLevelLessons(tx: Tx, levelId: string): Promise<string[]> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "Lesson"
    WHERE "levelId" = ${levelId}::uuid
    ORDER BY id
    FOR UPDATE
  `;
  return rows.map((row) => row.id);
}

async function lockLessonQuizzes(
  tx: Tx,
  lessonIds: readonly string[],
): Promise<string[]> {
  const quizzes = await tx.quiz.findMany({
    where: { lessonId: { in: [...lessonIds] } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  for (const quiz of quizzes) {
    await tx.$executeRaw`SELECT 1 FROM "Quiz" WHERE id = ${quiz.id}::uuid FOR UPDATE`;
  }
  return quizzes.map((quiz) => quiz.id);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

const SLUG_TAKEN = 'A level with this slug already exists';
const LEVEL_NOT_READY =
  'level_not_ready: Publish requires at least one published, active lesson';
const LESSON_NOT_READY =
  'lesson_not_ready: Publish requires a ready video or a live quiz with questions';

const LEVEL_AUDIT_FIELDS = [
  'slug',
  'hanzi',
  'title',
  'summary',
  'topics',
  'priceMinor',
  'coverImageId',
] as const;
const LEVEL_AUDIT_VALUES = [
  'slug',
  'hanzi',
  'title',
  'priceMinor',
  'coverImageId',
];

const LESSON_AUDIT_FIELDS = [
  'title',
  'description',
  'hanzi',
  'isFreePreview',
  'thumbnailId',
] as const;
const LESSON_AUDIT_VALUES = ['title', 'hanzi', 'isFreePreview', 'thumbnailId'];

@Injectable()
export class CatalogAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(VideoService) private readonly videos: VideoService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ----- levels ------------------------------------------------------------

  async listLevels(): Promise<AdminLevelsResponse> {
    const rows = await this.prisma.level.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { ...levelImageInclude, _count: { select: { lessons: true } } },
    });
    return {
      levels: rows.map(({ _count, ...row }) =>
        toAdminLevel(row, _count.lessons),
      ),
    };
  }

  async getLevel(id: string): Promise<AdminLevelDetail> {
    const row = await this.prisma.level.findUnique({
      where: { id },
      include: {
        ...levelImageInclude,
        lessons: {
          orderBy: { sortOrder: 'asc' },
          include: lessonAdminInclude,
        },
      },
    });
    if (!row) throw new NotFoundException('Level not found');
    const { lessons, ...level } = row;
    return {
      ...toAdminLevel(level, lessons.length),
      lessons: lessons.map(toAdminLesson),
    };
  }

  async createLevel(
    input: CreateLevelRequest,
    actorId: string,
  ): Promise<AdminLevel> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockScope(tx, LEVELS_LOCK_KEY);
        const existing = await tx.level.findUnique({
          where: { slug: input.slug },
          select: { id: true },
        });
        if (existing) throw new ConflictException(SLUG_TAKEN);
        await this.assertImageExists(tx, input.coverImageId);
        const { _max } = await tx.level.aggregate({
          _max: { sortOrder: true },
        });
        const row = await tx.level.create({
          data: {
            slug: input.slug,
            hanzi: input.hanzi,
            title: toJson(input.title),
            summary: toJson(input.summary),
            topics: toJson(input.topics),
            priceMinor: input.priceMinor,
            coverImageId: input.coverImageId,
            sortOrder: (_max.sortOrder ?? 0) + 1,
          },
          include: levelImageInclude,
        });
        await this.audit.record(tx, {
          actorId,
          action: 'level.create',
          entity: 'Level',
          entityId: row.id,
          data: { slug: row.slug, priceMinor: row.priceMinor },
        });
        return toAdminLevel(row, 0);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(SLUG_TAKEN);
      throw error;
    }
  }

  async updateLevel(
    id: string,
    input: UpdateLevelRequest,
    actorId: string,
  ): Promise<AdminLevel> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockLevelRow(tx, id);
        const current = await this.findLevelOrThrow(tx, id);
        if (
          input.slug !== undefined &&
          input.slug !== current.slug &&
          current.firstPublishedAt
        ) {
          throw new ConflictException(
            'The slug cannot change once the level has been published',
          );
        }
        await this.assertImageExists(tx, input.coverImageId);
        const row = await tx.level.update({
          where: { id },
          data: {
            slug: input.slug,
            hanzi: input.hanzi,
            title: input.title ? toJson(input.title) : undefined,
            summary: input.summary ? toJson(input.summary) : undefined,
            topics: input.topics ? toJson(input.topics) : undefined,
            priceMinor: input.priceMinor,
            coverImageId: input.coverImageId,
          },
          include: {
            ...levelImageInclude,
            _count: { select: { lessons: true } },
          },
        });
        const diff = diffAudit(
          current,
          row,
          LEVEL_AUDIT_FIELDS,
          LEVEL_AUDIT_VALUES,
        );
        if (diff.changed.length > 0) {
          await this.audit.record(tx, {
            actorId,
            action: 'level.update',
            entity: 'Level',
            entityId: id,
            data: diffData(diff),
          });
        }
        const { _count, ...level } = row;
        return toAdminLevel(level, _count.lessons);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(SLUG_TAKEN);
      throw error;
    }
  }

  async deleteLevel(id: string, actorId: string): Promise<void> {
    const removedVideos = await this.prisma.$transaction(async (tx) => {
      // Taking the lesson-scope lock keeps a concurrent lesson create from
      // slipping into the level while its complete content tree is removed.
      await lockScope(tx, lessonsLockKey(id));
      await lockScope(tx, LEVELS_LOCK_KEY);
      const level = await this.findLevelOrThrow(tx, id);
      await lockLevelRow(tx, id);
      const lessonIds = await lockLevelLessons(tx, id);
      const quizIds = await lockLessonQuizzes(tx, lessonIds);
      const videos = await tx.videoAsset.findMany({
        where: { lessonId: { in: lessonIds } },
      });
      const orderIds = (
        await tx.order.findMany({
          where: { levelId: id },
          select: { id: true },
        })
      ).map((order) => order.id);

      if (quizIds.length > 0) {
        await tx.quizAttempt.deleteMany({ where: { quizId: { in: quizIds } } });
        await tx.quiz.deleteMany({ where: { id: { in: quizIds } } });
      }
      if (lessonIds.length > 0) {
        await tx.lesson.deleteMany({ where: { id: { in: lessonIds } } });
      }
      await tx.enrollment.deleteMany({ where: { levelId: id } });
      if (orderIds.length > 0) {
        await tx.paymentTransaction.deleteMany({
          where: { orderId: { in: orderIds } },
        });
        await tx.order.deleteMany({ where: { id: { in: orderIds } } });
      }
      await tx.level.delete({ where: { id } });
      await this.audit.record(tx, {
        actorId,
        action: 'level.delete',
        entity: 'Level',
        entityId: id,
        data: {
          slug: level.slug,
          lessons: lessonIds.length,
          quizzes: quizIds.length,
          videos: videos.length,
          orders: orderIds.length,
        },
      });
      return videos;
    });
    await this.videos.discardAssets(removedVideos);
  }

  publishLevel(id: string, actorId: string): Promise<AdminLevel> {
    return this.updateLevelState(id, actorId, 'level.publish', (level) => ({
      isPublished: true,
      firstPublishedAt: level.firstPublishedAt ?? new Date(),
    }));
  }

  unpublishLevel(id: string, actorId: string): Promise<AdminLevel> {
    return this.updateLevelState(id, actorId, 'level.unpublish', () => ({
      isPublished: false,
    }));
  }

  archiveLevel(id: string, actorId: string): Promise<AdminLevel> {
    return this.updateLevelState(id, actorId, 'level.archive', (level) => ({
      archivedAt: level.archivedAt ?? new Date(),
    }));
  }

  unarchiveLevel(id: string, actorId: string): Promise<AdminLevel> {
    return this.updateLevelState(id, actorId, 'level.unarchive', () => ({
      archivedAt: null,
    }));
  }

  async reorderLevels(
    ids: string[],
    actorId: string,
  ): Promise<AdminLevelsResponse> {
    await this.prisma.$transaction(async (tx) => {
      await lockScope(tx, LEVELS_LOCK_KEY);
      const rows = await tx.level.findMany({ select: { id: true } });
      assertCompleteOrder(
        rows.map((row) => row.id),
        ids,
      );
      // Park every row on a negative sortOrder first so the unique index is
      // never violated mid-way, then assign the final 1..n positions.
      for (const [index, id] of ids.entries()) {
        await tx.level.update({
          where: { id },
          data: { sortOrder: -(index + 1) },
        });
      }
      for (const [index, id] of ids.entries()) {
        await tx.level.update({
          where: { id },
          data: { sortOrder: index + 1 },
        });
      }
      await this.audit.record(tx, {
        actorId,
        action: 'level.reorder',
        entity: 'Level',
        entityId: 'all',
        data: { order: ids },
      });
    });
    return this.listLevels();
  }

  // ----- lessons -----------------------------------------------------------

  async createLesson(
    levelId: string,
    input: CreateLessonRequest,
    actorId: string,
  ): Promise<AdminLesson> {
    return this.prisma.$transaction(async (tx) => {
      await lockScope(tx, lessonsLockKey(levelId));
      await this.findLevelOrThrow(tx, levelId);
      await this.assertImageExists(tx, input.thumbnailId);
      const { _max } = await tx.lesson.aggregate({
        where: { levelId },
        _max: { sortOrder: true },
      });
      const row = await tx.lesson.create({
        data: {
          levelId,
          title: toJson(input.title),
          description: input.description
            ? toJson(input.description)
            : Prisma.DbNull,
          hanzi: input.hanzi,
          isFreePreview: input.isFreePreview,
          thumbnailId: input.thumbnailId,
          sortOrder: (_max.sortOrder ?? 0) + 1,
        },
        include: lessonAdminInclude,
      });
      await this.audit.record(tx, {
        actorId,
        action: 'lesson.create',
        entity: 'Lesson',
        entityId: row.id,
        data: { levelId, isFreePreview: row.isFreePreview },
      });
      return toAdminLesson(row);
    });
  }

  async getLesson(id: string): Promise<AdminLesson> {
    const row = await this.prisma.lesson.findUnique({
      where: { id },
      include: lessonAdminInclude,
    });
    if (!row) throw new NotFoundException('Lesson not found');
    return toAdminLesson(row);
  }

  async updateLesson(
    id: string,
    input: UpdateLessonRequest,
    actorId: string,
  ): Promise<AdminLesson> {
    return this.prisma.$transaction(async (tx) => {
      await lockLessonRow(tx, id);
      const current = await this.findLessonOrThrow(tx, id);
      await this.assertImageExists(tx, input.thumbnailId);
      const row = await tx.lesson.update({
        where: { id },
        data: {
          title: input.title ? toJson(input.title) : undefined,
          description:
            input.description === undefined
              ? undefined
              : input.description === null
                ? Prisma.DbNull
                : toJson(input.description),
          hanzi: input.hanzi,
          isFreePreview: input.isFreePreview,
          thumbnailId: input.thumbnailId,
        },
        include: lessonAdminInclude,
      });
      const diff = diffAudit(
        current,
        row,
        LESSON_AUDIT_FIELDS,
        LESSON_AUDIT_VALUES,
      );
      if (diff.changed.length > 0) {
        await this.audit.record(tx, {
          actorId,
          // Flipping only the free-preview switch is its own action.
          action:
            diff.changed.length === 1 && diff.changed[0] === 'isFreePreview'
              ? 'lesson.free_preview'
              : 'lesson.update',
          entity: 'Lesson',
          entityId: id,
          data: { levelId: current.levelId, ...diffData(diff) },
        });
      }
      return toAdminLesson(row);
    });
  }

  async deleteLesson(id: string, actorId: string): Promise<void> {
    const removedVideos = await this.prisma.$transaction(async (tx) => {
      const lesson = await this.findLessonOrThrow(tx, id);
      await lockScope(tx, lessonsLockKey(lesson.levelId));
      await lockLessonRow(tx, id);
      const current = await this.findLessonOrThrow(tx, id);
      const quizIds = await lockLessonQuizzes(tx, [id]);
      // Video rows go with the lesson (cascade); their stored videos (files or
      // Bunny videos) are removed once the delete has committed.
      const videos = await tx.videoAsset.findMany({ where: { lessonId: id } });
      if (quizIds.length > 0) {
        await tx.quizAttempt.deleteMany({ where: { quizId: { in: quizIds } } });
        await tx.quiz.deleteMany({ where: { id: { in: quizIds } } });
      }
      await tx.lesson.delete({ where: { id } });
      await this.audit.record(tx, {
        actorId,
        action: 'lesson.delete',
        entity: 'Lesson',
        entityId: id,
        data: {
          levelId: current.levelId,
          quizzes: quizIds.length,
          videos: videos.length,
        },
      });
      return videos;
    });
    await this.videos.discardAssets(removedVideos);
  }

  publishLesson(id: string, actorId: string): Promise<AdminLesson> {
    return this.updateLessonState(id, actorId, 'lesson.publish', (lesson) => ({
      isPublished: true,
      firstPublishedAt: lesson.firstPublishedAt ?? new Date(),
    }));
  }

  unpublishLesson(id: string, actorId: string): Promise<AdminLesson> {
    return this.updateLessonState(id, actorId, 'lesson.unpublish', () => ({
      isPublished: false,
    }));
  }

  archiveLesson(id: string, actorId: string): Promise<AdminLesson> {
    return this.updateLessonState(id, actorId, 'lesson.archive', (lesson) => ({
      archivedAt: lesson.archivedAt ?? new Date(),
    }));
  }

  unarchiveLesson(id: string, actorId: string): Promise<AdminLesson> {
    return this.updateLessonState(id, actorId, 'lesson.unarchive', () => ({
      archivedAt: null,
    }));
  }

  async reorderLessons(
    levelId: string,
    ids: string[],
    actorId: string,
  ): Promise<AdminLevelDetail['lessons']> {
    await this.prisma.$transaction(async (tx) => {
      await lockScope(tx, lessonsLockKey(levelId));
      await this.findLevelOrThrow(tx, levelId);
      const rows = await tx.lesson.findMany({
        where: { levelId },
        select: { id: true },
      });
      assertCompleteOrder(
        rows.map((row) => row.id),
        ids,
      );
      for (const [index, id] of ids.entries()) {
        await tx.lesson.update({
          where: { id },
          data: { sortOrder: -(index + 1) },
        });
      }
      for (const [index, id] of ids.entries()) {
        await tx.lesson.update({
          where: { id },
          data: { sortOrder: index + 1 },
        });
      }
      await this.audit.record(tx, {
        actorId,
        action: 'lesson.reorder',
        entity: 'Level',
        entityId: levelId,
        data: { order: ids },
      });
    });
    return (await this.getLevel(levelId)).lessons;
  }

  // ----- helpers -----------------------------------------------------------

  private async assertImageExists(
    tx: Tx | PrismaService,
    id: string | null | undefined,
  ): Promise<void> {
    if (!id) return;
    const asset = await tx.mediaAsset.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!asset) throw new BadRequestException('Unknown image');
  }

  private async findLevelOrThrow(tx: Tx | PrismaService, id: string) {
    const level = await tx.level.findUnique({ where: { id } });
    if (!level) throw new NotFoundException('Level not found');
    return level;
  }

  private async findLessonOrThrow(tx: Tx | PrismaService, id: string) {
    const lesson = await tx.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  private updateLevelState(
    id: string,
    actorId: string,
    action: string,
    data: (level: {
      archivedAt: Date | null;
      firstPublishedAt: Date | null;
    }) => Prisma.LevelUpdateInput,
  ): Promise<AdminLevel> {
    return this.prisma.$transaction(async (tx) => {
      await lockLevelRow(tx, id);
      const current = await this.findLevelOrThrow(tx, id);
      if (action === 'level.publish') {
        const count = await tx.lesson.count({
          where: { levelId: id, isPublished: true, archivedAt: null },
        });
        if (count === 0) throw new ConflictException(LEVEL_NOT_READY);
      }
      const row = await tx.level.update({
        where: { id },
        data: data(current),
        include: {
          ...levelImageInclude,
          _count: { select: { lessons: true } },
        },
      });
      // Repeating a transition that already holds changes nothing to record.
      if (
        current.isPublished !== row.isPublished ||
        (current.archivedAt === null) !== (row.archivedAt === null)
      ) {
        await this.audit.record(tx, {
          actorId,
          action,
          entity: 'Level',
          entityId: id,
          data: { slug: row.slug },
        });
      }
      const { _count, ...level } = row;
      return toAdminLevel(level, _count.lessons);
    });
  }

  private updateLessonState(
    id: string,
    actorId: string,
    action: string,
    data: (lesson: {
      archivedAt: Date | null;
      firstPublishedAt: Date | null;
    }) => Prisma.LessonUpdateInput,
  ): Promise<AdminLesson> {
    return this.prisma.$transaction(async (tx) => {
      await lockLessonRow(tx, id);
      const current = await this.findLessonOrThrow(tx, id);
      if (action === 'lesson.publish') {
        const lesson = await tx.lesson.findUniqueOrThrow({
          where: { id },
          select: {
            activeVideoId: true,
            activeVideo: { select: { status: true } },
            quizzes: {
              where: { archivedAt: null },
              select: { _count: { select: { questions: true } } },
            },
          },
        });
        const playableVideo =
          lesson.activeVideoId !== null &&
          lesson.activeVideo?.status === 'READY';
        const quizWithQuestions = lesson.quizzes.some(
          (quiz) => quiz._count.questions > 0,
        );
        if (!playableVideo && !quizWithQuestions)
          throw new ConflictException(LESSON_NOT_READY);
      }
      const row = await tx.lesson.update({
        where: { id },
        data: data(current),
        include: lessonAdminInclude,
      });
      if (
        current.isPublished !== row.isPublished ||
        (current.archivedAt === null) !== (row.archivedAt === null)
      ) {
        await this.audit.record(tx, {
          actorId,
          action,
          entity: 'Lesson',
          entityId: id,
          data: { levelId: row.levelId },
        });
      }
      return toAdminLesson(row);
    });
  }
}
