import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PublicUser } from '@app/shared';

import {
  decideLesson,
  decideLevel,
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
    return decideLesson({ user, lesson, level: lesson.level, enrollment });
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
