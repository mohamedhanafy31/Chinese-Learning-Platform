import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { BunnyClient, BunnyError } from './bunny/bunny.client';
import { PrismaService } from '../../prisma/prisma.service';

const PENDING_DELETE_BATCH_SIZE = 50;
const BASE_BACKOFF_MS = 15 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;

export const PENDING_VIDEO_DELETE_CLOCK = Symbol('PENDING_VIDEO_DELETE_CLOCK');

export function pendingVideoDeleteBackoffMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 3);
  return Math.min(BASE_BACKOFF_MS * 2 ** exponent, MAX_BACKOFF_MS);
}

function safeErrorMessage(error: unknown): string {
  return error instanceof BunnyError
    ? error.message
    : 'Bunny delete request failed';
}

@Injectable()
export class PendingVideoDeleteService {
  private readonly logger = new Logger(PendingVideoDeleteService.name);
  private running = false;
  private readonly now: () => Date;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BunnyClient) private readonly client: BunnyClient,
    @Optional()
    @Inject(PENDING_VIDEO_DELETE_CLOCK)
    now?: () => Date,
  ) {
    this.now = now ?? (() => new Date());
  }

  async retryDue(
    now = this.now(),
  ): Promise<{ checked: number; deleted: number; rescheduled: number }> {
    const result = { checked: 0, deleted: 0, rescheduled: 0 };
    if (this.running) return result;
    this.running = true;
    try {
      const rows = await this.prisma.pendingVideoDelete.findMany({
        where: { nextAttemptAt: { lte: now } },
        orderBy: { nextAttemptAt: 'asc' },
        take: PENDING_DELETE_BATCH_SIZE,
      });
      for (const row of rows) {
        result.checked += 1;
        try {
          await this.client.deleteVideo(
            row.bunnyVideoId,
            row.bunnyLibraryId ?? undefined,
          );
          await this.prisma.pendingVideoDelete.deleteMany({
            where: { id: row.id },
          });
          result.deleted += 1;
        } catch (error) {
          if (error instanceof BunnyError && error.status === 404) {
            await this.prisma.pendingVideoDelete.deleteMany({
              where: { id: row.id },
            });
            result.deleted += 1;
            continue;
          }
          const attempts = row.attempts + 1;
          await this.prisma.pendingVideoDelete.updateMany({
            where: { id: row.id },
            data: {
              attempts,
              lastError: safeErrorMessage(error).slice(0, 500),
              nextAttemptAt: new Date(
                now.getTime() + pendingVideoDeleteBackoffMs(attempts),
              ),
            },
          });
          result.rescheduled += 1;
        }
      }
    } catch (error) {
      this.logger.error(
        `Pending Bunny delete retry pass failed: ${safeErrorMessage(error)}`,
      );
    } finally {
      this.running = false;
    }
    return result;
  }
}
