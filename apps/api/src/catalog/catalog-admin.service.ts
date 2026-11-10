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

import { assertCompleteOrder } from './catalog-order';
import {
  lessonImageInclude,
  levelImageInclude,
  toAdminLesson,
  toAdminLevel,
} from './catalog.mapper';
import { Prisma } from '../generated/prisma/client';
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

@Injectable()
export class CatalogAdminService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
          include: lessonImageInclude,
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

  async createLevel(input: CreateLevelRequest): Promise<AdminLevel> {
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
        const { _count, ...level } = row;
        return toAdminLevel(level, _count.lessons);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(SLUG_TAKEN);
      throw error;
    }
  }

  async deleteLevel(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Taking the lesson-scope lock keeps a concurrent lesson create from
      // slipping in between the "no lessons" check and the delete.
      await lockScope(tx, lessonsLockKey(id));
      await lockScope(tx, LEVELS_LOCK_KEY);
      const level = await this.findLevelOrThrow(tx, id);
      if (level.firstPublishedAt) {
        throw new ConflictException(
          'A published level cannot be deleted. Archive it instead.',
        );
      }
      const lessons = await tx.lesson.count({ where: { levelId: id } });
      if (lessons > 0) {
        throw new ConflictException(
          'A level with lessons cannot be deleted. Delete its lessons or archive the level instead.',
        );
      }
      await tx.level.delete({ where: { id } });
    });
  }

  publishLevel(id: string): Promise<AdminLevel> {
    return this.updateLevelState(id, (level) => ({
      isPublished: true,
      firstPublishedAt: level.firstPublishedAt ?? new Date(),
    }));
  }

  unpublishLevel(id: string): Promise<AdminLevel> {
    return this.updateLevelState(id, () => ({ isPublished: false }));
  }

  archiveLevel(id: string): Promise<AdminLevel> {
    return this.updateLevelState(id, (level) => ({
      archivedAt: level.archivedAt ?? new Date(),
    }));
  }

  unarchiveLevel(id: string): Promise<AdminLevel> {
    return this.updateLevelState(id, () => ({ archivedAt: null }));
  }

  async reorderLevels(ids: string[]): Promise<AdminLevelsResponse> {
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
    });
    return this.listLevels();
  }

  // ----- lessons -----------------------------------------------------------

  async createLesson(
    levelId: string,
    input: CreateLessonRequest,
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
        include: lessonImageInclude,
      });
      return toAdminLesson(row);
    });
  }

  async getLesson(id: string): Promise<AdminLesson> {
    const row = await this.prisma.lesson.findUnique({
      where: { id },
      include: lessonImageInclude,
    });
    if (!row) throw new NotFoundException('Lesson not found');
    return toAdminLesson(row);
  }

  async updateLesson(
    id: string,
    input: UpdateLessonRequest,
  ): Promise<AdminLesson> {
    await this.findLessonOrThrow(this.prisma, id);
    await this.assertImageExists(this.prisma, input.thumbnailId);
    const row = await this.prisma.lesson.update({
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
      include: lessonImageInclude,
    });
    return toAdminLesson(row);
  }

  async deleteLesson(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const lesson = await this.findLessonOrThrow(tx, id);
      await lockScope(tx, lessonsLockKey(lesson.levelId));
      const current = await this.findLessonOrThrow(tx, id);
      if (current.firstPublishedAt) {
        throw new ConflictException(
          'A published lesson cannot be deleted. Archive it instead.',
        );
      }
      await tx.lesson.delete({ where: { id } });
    });
  }

  publishLesson(id: string): Promise<AdminLesson> {
    return this.updateLessonState(id, (lesson) => ({
      isPublished: true,
      firstPublishedAt: lesson.firstPublishedAt ?? new Date(),
    }));
  }

  unpublishLesson(id: string): Promise<AdminLesson> {
    return this.updateLessonState(id, () => ({ isPublished: false }));
  }

  archiveLesson(id: string): Promise<AdminLesson> {
    return this.updateLessonState(id, (lesson) => ({
      archivedAt: lesson.archivedAt ?? new Date(),
    }));
  }

  unarchiveLesson(id: string): Promise<AdminLesson> {
    return this.updateLessonState(id, () => ({ archivedAt: null }));
  }

  async reorderLessons(
    levelId: string,
    ids: string[],
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
    data: (level: {
      archivedAt: Date | null;
      firstPublishedAt: Date | null;
    }) => Prisma.LevelUpdateInput,
  ): Promise<AdminLevel> {
    return this.prisma.$transaction(async (tx) => {
      await lockLevelRow(tx, id);
      const current = await this.findLevelOrThrow(tx, id);
      const row = await tx.level.update({
        where: { id },
        data: data(current),
        include: {
          ...levelImageInclude,
          _count: { select: { lessons: true } },
        },
      });
      const { _count, ...level } = row;
      return toAdminLevel(level, _count.lessons);
    });
  }

  private updateLessonState(
    id: string,
    data: (lesson: {
      archivedAt: Date | null;
      firstPublishedAt: Date | null;
    }) => Prisma.LessonUpdateInput,
  ): Promise<AdminLesson> {
    return this.prisma.$transaction(async (tx) => {
      await lockLessonRow(tx, id);
      const current = await this.findLessonOrThrow(tx, id);
      const row = await tx.lesson.update({
        where: { id },
        data: data(current),
        include: lessonImageInclude,
      });
      return toAdminLesson(row);
    });
  }
}
