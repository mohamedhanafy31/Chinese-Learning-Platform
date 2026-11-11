import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Role, type PublicUser } from '@app/shared';

import {
  decideLesson,
  decideLevel,
  firstIncompleteLesson,
  isActiveEnrollment,
  isLevelReadableByEnrollees,
  type AccessDecision,
  type AccessEnrollment,
} from './content-access';
import { PrismaService } from '../prisma/prisma.service';

export {
  decideLesson,
  decideLevel,
  isActiveEnrollment,
  isLevelPubliclyVisible,
  isLevelReadableByEnrollees,
  type AccessDecision,
  type AccessReason,
} from './content-access';

/**
 * The single place that answers "may this user see this content?". It loads
 * the rows and delegates to the pure `decideLesson` / `decideLevel`.
 */
@Injectable()
export class ContentAccessPolicy {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async forLesson(
    user: PublicUser | null,
    lessonId: string,
  ): Promise<AccessDecision> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { level: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const enrollment = await this.findEnrollment(user, lesson.levelId);
    const requiredLessonId = await this.sequenceBlock(
      user,
      lesson,
      lesson.level,
      enrollment,
    );
    return decideLesson({
      user,
      lesson,
      level: lesson.level,
      enrollment,
      requiredLessonId,
    });
  }

  /**
   * The earlier visible lesson an enrolled learner still has to complete before
   * this one, or null. Only looked up when it can matter: an active enrollment
   * on a live, non-preview lesson that is not the first of the level.
   */
  private async sequenceBlock(
    user: PublicUser | null,
    lesson: {
      levelId: string;
      sortOrder: number;
      isPublished: boolean;
      archivedAt: Date | null;
      isFreePreview: boolean;
    },
    level: { isPublished: boolean; archivedAt: Date | null },
    enrollment: AccessEnrollment | null,
  ): Promise<string | null> {
    if (
      !user ||
      user.role === Role.ADMIN ||
      lesson.isFreePreview ||
      !lesson.isPublished ||
      lesson.archivedAt !== null ||
      !isActiveEnrollment(enrollment) ||
      !isLevelReadableByEnrollees(level)
    ) {
      return null;
    }
    const earlier = await this.prisma.lesson.findMany({
      where: {
        levelId: lesson.levelId,
        isPublished: true,
        archivedAt: null,
        sortOrder: { lt: lesson.sortOrder },
      },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, isFreePreview: true },
    });
    if (!earlier.some((lesson) => !lesson.isFreePreview)) return null;
    const done = await this.prisma.lessonProgress.findMany({
      where: {
        userId: user.id,
        lessonId: { in: earlier.map(({ id }) => id) },
        completedAt: { not: null },
      },
      select: { lessonId: true },
    });
    return firstIncompleteLesson(
      earlier,
      new Set(done.map(({ lessonId }) => lessonId)),
    );
  }

  async forLevel(
    user: PublicUser | null,
    levelId: string,
  ): Promise<AccessDecision> {
    const level = await this.prisma.level.findUnique({
      where: { id: levelId },
    });
    if (!level) throw new NotFoundException('Level not found');
    const enrollment = await this.findEnrollment(user, levelId);
    return decideLevel({ user, level, enrollment });
  }

  private async findEnrollment(
    user: PublicUser | null,
    levelId: string,
  ): Promise<AccessEnrollment | null> {
    if (!user) return null;
    return this.prisma.enrollment.findUnique({
      where: { userId_levelId: { userId: user.id, levelId } },
      select: { revokedAt: true },
    });
  }
}
