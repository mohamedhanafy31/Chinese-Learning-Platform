import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  Role,
  type LevelAccessResponse,
  type MyLevel,
  type MyLevelDetail,
  type MyLevelsResponse,
  type PublicUser,
} from '@app/shared';

import {
  decideLesson,
  decideLevel,
  isActiveEnrollment,
  isLevelPubliclyVisible,
  isLevelReadableByEnrollees,
  pathAccess,
  sequenceState,
} from './content-access';
import { summariseLevel, type LevelProgressSummary } from './level-progress';
import {
  lessonImageInclude,
  levelImageInclude,
  parseLocalizedText,
  parseTopics,
  toPublicLesson,
} from '../catalog/catalog.mapper';
import type { LevelRow } from '../catalog/catalog.mapper';
import { toImageRef } from '../media/media-url';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';

const visibleLessons = {
  where: { isPublished: true, archivedAt: null },
  orderBy: { sortOrder: 'asc' },
} as const;

@Injectable()
export class LearningReadService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProgressService) private readonly progress: ProgressService,
  ) {}

  /** Public numbering: the position among published, non-archived levels. */
  private async publicNumbers(): Promise<Map<string, number>> {
    const visible = await this.prisma.level.findMany({
      where: { isPublished: true, archivedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true },
    });
    return new Map(visible.map((level, index) => [level.slug, index + 1]));
  }

  private toMyLevel(
    row: LevelRow,
    lessonCount: number,
    enrolledAt: Date,
    numbers: Map<string, number>,
    summary: LevelProgressSummary,
  ): MyLevel {
    return {
      slug: row.slug,
      number: row.archivedAt ? null : (numbers.get(row.slug) ?? null),
      hanzi: row.hanzi,
      title: parseLocalizedText(row.title),
      summary: parseLocalizedText(row.summary),
      coverImage: toImageRef(row.coverImage),
      lessonCount,
      archived: row.archivedAt !== null,
      enrolledAt: enrolledAt.toISOString(),
      progress: {
        completed: summary.completed,
        total: summary.total,
        nextLessonId: summary.nextLessonId,
        nextLesson: summary.nextLesson
          ? {
              id: summary.nextLesson.id,
              number: summary.nextLesson.number,
              title: parseLocalizedText(summary.nextLesson.title),
            }
          : null,
        lessons: summary.lessons,
      },
    };
  }

  async myLevels(userId: string): Promise<MyLevelsResponse> {
    const [numbers, rows] = await Promise.all([
      this.publicNumbers(),
      this.prisma.level.findMany({
        where: {
          OR: [
            { isPublished: true, archivedAt: null },
            {
              archivedAt: { not: null },
              enrollments: { some: { userId, revokedAt: null } },
            },
          ],
        },
        orderBy: { sortOrder: 'asc' },
        include: {
          ...levelImageInclude,
          lessons: {
            ...visibleLessons,
            select: { id: true, title: true, isFreePreview: true },
          },
          enrollments: {
            where: { userId, revokedAt: null },
            select: { createdAt: true },
            take: 1,
          },
        },
      }),
    ]);
    const completed = await this.progress.completedLessonIds(
      userId,
      rows.flatMap(({ lessons }) => lessons.map(({ id }) => id)),
    );
    return {
      levels: rows.map(({ lessons, enrollments, ...row }) => {
        return this.toMyLevel(
          row,
          lessons.length,
          enrollments[0]?.createdAt ?? row.firstPublishedAt ?? row.createdAt,
          numbers,
          summariseLevel(lessons, completed),
        );
      }),
    };
  }

  /** One public level, or an archived level retained by a historical learner. */
  async myLevel(userId: string, slug: string): Promise<MyLevelDetail> {
    const level = await this.prisma.level.findFirst({
      where: {
        slug,
        OR: [
          { isPublished: true, archivedAt: null },
          {
            archivedAt: { not: null },
            enrollments: { some: { userId, revokedAt: null } },
          },
        ],
      },
      include: {
        ...levelImageInclude,
        lessons: { ...visibleLessons, include: lessonImageInclude },
        enrollments: {
          where: { userId, revokedAt: null },
          select: { createdAt: true },
          take: 1,
        },
      },
    });
    if (!level) throw new NotFoundException('Level not found');
    const numbers = await this.publicNumbers();
    const { lessons, enrollments, ...row } = level;
    const completed = await this.progress.completedLessonIds(
      userId,
      lessons.map(({ id }) => id),
    );
    return {
      ...this.toMyLevel(
        row,
        lessons.length,
        enrollments[0]?.createdAt ?? row.firstPublishedAt ?? row.createdAt,
        numbers,
        summariseLevel(lessons, completed),
      ),
      topics: parseTopics(row.topics),
      priceMinor: row.priceMinor,
      currency: row.currency,
      lessons: lessons.map((lesson, index) =>
        toPublicLesson(lesson, index + 1),
      ),
    };
  }

  /**
   * Per-lesson access for the lessons the public detail shows. Archived levels
   * answer only for their enrollees; everything else is a 404, like the
   * public detail.
   */
  async levelAccess(
    user: PublicUser | null,
    slug: string,
  ): Promise<LevelAccessResponse> {
    const level = await this.prisma.level.findUnique({
      where: { slug },
      include: { lessons: visibleLessons },
    });
    if (!level) throw new NotFoundException('Level not found');

    const enrollment = user
      ? await this.prisma.enrollment.findUnique({
          where: { userId_levelId: { userId: user.id, levelId: level.id } },
          select: { revokedAt: true },
        })
      : null;
    const levelDecision = decideLevel({ user, level, enrollment });
    if (!isLevelPubliclyVisible(level) && levelDecision.reason !== 'enrolled') {
      throw new NotFoundException('Level not found');
    }

    // This is the learner's view of the level: staff are shown what a learner
    // without an enrollment would see (their own access goes through
    // `ContentAccessPolicy` on the lesson itself).
    const viewer = user ? { id: user.id, role: Role.STUDENT } : null;
    const enrolled = Boolean(
      user &&
      (isLevelPubliclyVisible(level) ||
        (isActiveEnrollment(enrollment) && isLevelReadableByEnrollees(level))),
    );
    // A signed-in learner's lessons follow the sequence (done, next, preview,
    // locked); anonymous visitors see every lesson as login-locked.
    const completed =
      enrolled && user
        ? await this.progress.completedLessonIds(
            user.id,
            level.lessons.map(({ id }) => id),
          )
        : new Set<string>();
    const states = new Map(
      sequenceState(
        level.lessons,
        completed,
        new Set(level.lessons.filter((l) => l.isFreePreview).map((l) => l.id)),
      ).map(({ id, state }) => [id, state]),
    );
    const summary = enrolled ? summariseLevel(level.lessons, completed) : null;
    return {
      enrolled,
      lessons: level.lessons.map((lesson) => {
        const decision = decideLesson({
          user: viewer,
          lesson,
          level,
          enrollment,
        });
        return {
          id: lesson.id,
          access: pathAccess(decision, states.get(lesson.id)),
        };
      }),
      progress: summary && {
        completed: summary.completed,
        total: summary.total,
        nextLessonId: summary.nextLessonId,
      },
    };
  }
}
