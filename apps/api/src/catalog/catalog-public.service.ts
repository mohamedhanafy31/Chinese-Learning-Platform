import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PublicLevelDetail, PublicLevelsResponse } from '@app/shared';

import {
  lessonImageInclude,
  levelImageInclude,
  toPublicLesson,
  toPublicLevel,
} from './catalog.mapper';
import { PrismaService } from '../prisma/prisma.service';

const visibleLessons = {
  where: { isPublished: true, archivedAt: null },
  orderBy: { sortOrder: 'asc' },
} as const;

@Injectable()
export class CatalogPublicService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listLevels(): Promise<PublicLevelsResponse> {
    const rows = await this.prisma.level.findMany({
      where: { isPublished: true, archivedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        ...levelImageInclude,
        _count: {
          select: { lessons: { where: visibleLessons.where } },
        },
      },
    });
    return {
      levels: rows.map(({ _count, ...row }, index) =>
        toPublicLevel(row, index + 1, _count.lessons),
      ),
    };
  }

  async getLevel(slug: string): Promise<PublicLevelDetail> {
    const visible = await this.prisma.level.findMany({
      where: { isPublished: true, archivedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true },
    });
    const index = visible.findIndex((level) => level.slug === slug);
    if (index === -1) throw new NotFoundException('Level not found');
    const row = await this.prisma.level.findFirst({
      where: { slug, isPublished: true, archivedAt: null },
      include: {
        ...levelImageInclude,
        lessons: { ...visibleLessons, include: lessonImageInclude },
      },
    });
    if (!row) throw new NotFoundException('Level not found');
    const { lessons, ...level } = row;
    return {
      ...toPublicLevel(level, index + 1, lessons.length),
      lessons: lessons.map((lesson, position) =>
        toPublicLesson(lesson, position + 1),
      ),
    };
  }
}
