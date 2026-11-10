import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  VideoStatus,
  type LessonAccess,
  type PlaybackResponse,
  type PublicUser,
} from '@app/shared';

import { LocalProvider } from './local.provider';
import { assertWatchable } from './video-access';
import {
  parseLocalizedText,
  parseOptionalLocalizedText,
} from '../../catalog/catalog.mapper';
import {
  decideLesson,
  type AccessDecision,
} from '../../learning/content-access';
import { ContentAccessPolicy } from '../../learning/content-access.policy';
import { PrismaService } from '../../prisma/prisma.service';
import { toImageRef } from '../media-url';

/** The 404 raised when the lesson is open to the viewer but has no video. */
export class NoVideoError extends NotFoundException {
  constructor(context: Omit<PlaybackResponse, 'video'>) {
    super({
      statusCode: 404,
      error: 'Not Found',
      message: 'This lesson has no video yet',
      reason: 'no-video',
      ...context,
    });
  }
}

function siblingAccess(decision: AccessDecision): LessonAccess {
  if (!decision.allowed) return 'locked';
  return decision.reason === 'free-preview' ? 'preview' : 'open';
}

@Injectable()
export class VideoPlaybackService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ContentAccessPolicy) private readonly policy: ContentAccessPolicy,
    @Inject(LocalProvider) private readonly local: LocalProvider,
  ) {}

  /** What the lesson page needs to play one lesson, or the reason it cannot. */
  async playback(
    user: PublicUser | null,
    lessonId: string,
  ): Promise<PlaybackResponse> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { level: true, thumbnail: true, activeVideo: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    assertWatchable(
      await this.policy.forLesson(user, lessonId),
      lesson.level.slug,
    );

    const [visible, enrollment] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { levelId: lesson.levelId, isPublished: true, archivedAt: null },
        orderBy: { sortOrder: 'asc' },
      }),
      user
        ? this.prisma.enrollment.findUnique({
            where: {
              userId_levelId: { userId: user.id, levelId: lesson.levelId },
            },
            select: { revokedAt: true },
          })
        : null,
    ]);
    const siblings = visible.map((sibling, index) => ({
      id: sibling.id,
      number: index + 1,
      title: parseLocalizedText(sibling.title),
      hanzi: sibling.hanzi,
      access: siblingAccess(
        decideLesson({
          user,
          lesson: sibling,
          level: lesson.level,
          enrollment,
        }),
      ),
    }));
    // An unpublished lesson only an admin can open is not in the list; number
    // it by its place among the visible lessons before it.
    const position = visible.findIndex((sibling) => sibling.id === lesson.id);
    const number =
      position >= 0
        ? position + 1
        : visible.filter((sibling) => sibling.sortOrder < lesson.sortOrder)
            .length + 1;

    const context = {
      lesson: {
        id: lesson.id,
        number,
        title: parseLocalizedText(lesson.title),
        description: parseOptionalLocalizedText(lesson.description),
        hanzi: lesson.hanzi,
      },
      level: {
        slug: lesson.level.slug,
        hanzi: lesson.level.hanzi,
        title: parseLocalizedText(lesson.level.title),
      },
      poster: toImageRef(lesson.thumbnail)?.url ?? null,
      siblings,
    };

    const video = lesson.activeVideo;
    if (!video || video.status !== VideoStatus.READY) {
      throw new NoVideoError(context);
    }
    const descriptor = this.local.playback(video);
    return {
      ...context,
      video: {
        provider: descriptor.provider,
        src: descriptor.src,
        mime: descriptor.mime,
        durationSec: video.durationSec,
      },
    };
  }
}
