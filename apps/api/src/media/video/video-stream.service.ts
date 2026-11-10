import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream';

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Role, VideoProvider, VideoStatus, type PublicUser } from '@app/shared';
import type { Request, Response } from 'express';

import { LocalProvider } from './local.provider';
import { parseRange } from './range';
import { assertWatchable } from './video-access';
import { ContentAccessPolicy } from '../../learning/content-access.policy';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VideoStreamService {
  private readonly logger = new Logger(VideoStreamService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ContentAccessPolicy) private readonly policy: ContentAccessPolicy,
    @Inject(LocalProvider) private readonly local: LocalProvider,
  ) {}

  /**
   * Answers GET and HEAD for one stored video, honouring a single Range. The
   * lesson's access decision is re-evaluated on every request, so a revoked
   * enrollment stops the stream at the next range fetch.
   */
  async serve(
    user: PublicUser | null,
    assetId: string,
    request: Request,
    response: Response,
    headOnly: boolean,
  ): Promise<void> {
    const asset = await this.prisma.videoAsset.findUnique({
      where: { id: assetId },
      include: { lesson: { include: { level: { select: { slug: true } } } } },
    });
    if (!asset) throw new NotFoundException('Video not found');
    const decision = await this.policy.forLesson(user, asset.lessonId);
    assertWatchable(decision, asset.lesson.level.slug);

    const isAdmin = user?.role === Role.ADMIN;
    if (
      asset.status !== VideoStatus.READY ||
      asset.provider !== VideoProvider.LOCAL ||
      !asset.localKey ||
      (!isAdmin && asset.lesson.activeVideoId !== asset.id)
    ) {
      throw new NotFoundException('Video not found');
    }

    const file = this.local.pathFor(asset.localKey);
    const size = await stat(file).then(
      (stats) => stats.size,
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') {
          this.logger.error(`Cannot read video ${asset.id}: ${error.message}`);
        }
        return null;
      },
    );
    if (size === null) throw new NotFoundException('Video not found');

    response.set({
      'Accept-Ranges': 'bytes',
      'Content-Type': asset.mime ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    });

    const range = parseRange(request.headers.range, size);
    if (range.kind === 'unsatisfiable') {
      response.set('Content-Range', `bytes */${size}`);
      response.status(416).end();
      return;
    }

    let start = 0;
    let end = size - 1;
    if (range.kind === 'partial') {
      ({ start, end } = range);
      response.status(206);
      response.set('Content-Range', `bytes ${start}-${end}/${size}`);
    } else {
      response.status(200);
    }
    response.set('Content-Length', String(size === 0 ? 0 : end - start + 1));

    if (headOnly || size === 0) {
      response.end();
      return;
    }

    const source = createReadStream(file, { start, end });
    // `pipeline` honours backpressure and destroys the file stream when the
    // client goes away; the resulting premature-close error is expected.
    pipeline(source, response, (error) => {
      if (
        error &&
        (error as NodeJS.ErrnoException).code !== 'ERR_STREAM_PREMATURE_CLOSE'
      ) {
        this.logger.warn(`Stream of video ${asset.id} ended: ${error.message}`);
      }
    });
  }
}
