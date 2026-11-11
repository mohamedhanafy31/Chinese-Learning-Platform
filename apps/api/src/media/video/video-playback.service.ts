import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  VideoStatus,
  type PlaybackResponse,
  type PublicUser,
} from '@app/shared';

import { VideoProviders } from './video-providers';
import { assertWatchable } from './video-access';
import {
  parseLocalizedText,
  parseOptionalLocalizedText,
} from '../../catalog/catalog.mapper';
import {
  decideLesson,
  pathAccess,
  sequenceState,
} from '../../learning/content-access';
import { ContentAccessPolicy } from '../../learning/content-access.policy';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressService } from '../../progress/progress.service';
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

@Injectable()
export class VideoPlaybackService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ContentAccessPolicy) private readonly policy: ContentAccessPolicy,
    @Inject(VideoProviders) private readonly providers: VideoProviders,
    @Inject(ProgressService) private readonly progress: ProgressService,
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
    const decision = await this.policy.forLesson(user, lessonId);
    assertWatchable(decision, lesson.level.slug);

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
    // Read only: this GET is prefetched by Next links, so it must never
    // complete anything (the lesson page reports an opening by POST).
    const progress = user
      ? await this.progress.lessonView(user.id, lesson.id)
      : null;
    // An enrolled learner's siblings follow the sequence (done, next, a later
    // free preview, locked); staff see everything open.
    const states = new Map(
      sequenceState(
        visible,
        user
          ? await this.progress.completedLessonIds(
              user.id,
              visible.map(({ id }) => id),
            )
          : new Set<string>(),
        new Set(visible.filter((l) => l.isFreePreview).map((l) => l.id)),
      ).map(({ id, state }) => [id, state]),
    );
    const siblings = visible.map((sibling, index) => ({
      id: sibling.id,
      number: index + 1,
      title: parseLocalizedText(sibling.title),
      hanzi: sibling.hanzi,
      access: pathAccess(
        decideLesson({
          user,
          lesson: sibling,
          level: lesson.level,
          enrollment,
        }),
        states.get(sibling.id),
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
      progress,
    };

    const video = lesson.activeVideo;
    if (!video || video.status !== VideoStatus.READY) {
      throw new NoVideoError(context);
    }
    // Each asset keeps its own provider, whichever one is active for uploads.
    const descriptor = this.providers.for(video.provider).playback(video);
    return {
      ...context,
      video:
        descriptor.provider === 'BUNNY'
          ? {
              provider: 'BUNNY',
              embedUrl: descriptor.embedUrl,
              expiresAt: descriptor.expiresAt,
              durationSec: video.durationSec,
            }
          : {
              provider: 'LOCAL',
              src: descriptor.src,
              mime: descriptor.mime,
              durationSec: video.durationSec,
            },
    };
  }
}
