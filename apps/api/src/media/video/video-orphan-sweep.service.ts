import { opendir, lstat, unlink } from 'node:fs/promises';
import type { Dir, Dirent } from 'node:fs';
import path from 'node:path';

import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../config/environment';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaStorage } from '../media-storage';
import { sweepLocalOrphans } from './local-orphan-sweep';

@Injectable()
export class VideoOrphanSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideoOrphanSweepService.name);
  private startupTimer: ReturnType<typeof setTimeout> | undefined;
  private intervalTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @Inject(MediaStorage) private readonly storage: MediaStorage,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}

  onModuleInit(): void {
    const interval = this.config.get('VIDEO_ORPHAN_SWEEP_INTERVAL_SEC', {
      infer: true,
    });
    if (
      this.config.get('NODE_ENV', { infer: true }) === 'test' ||
      interval === 0
    ) {
      return;
    }
    this.startupTimer = setTimeout(() => {
      void this.runSweep();
      this.intervalTimer = setInterval(
        () => void this.runSweep(),
        interval * 1000,
      );
      this.intervalTimer.unref?.();
    }, 60_000);
    this.startupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
  }

  private async runSweep(): Promise<void> {
    try {
      let directory: Dir | undefined;
      let iterator: AsyncIterator<Dirent> | undefined;
      let lookAhead: IteratorResult<Dirent> | undefined;
      const result = await sweepLocalOrphans(
        {
          readEntries: async (limit) => {
            if (!directory) directory = await opendir(this.storage.videosDir);
            const currentDirectory = directory;
            const currentIterator =
              iterator ?? (iterator = currentDirectory[Symbol.asyncIterator]());
            const entries = [];
            for (let index = 0; index < limit; index++) {
              const next = lookAhead ?? (await currentIterator.next());
              lookAhead = undefined;
              if (next.done) break;
              entries.push({
                name: next.value.name,
                isFile: next.value.isFile(),
              });
            }
            if (entries.length < limit) {
              return { entries, hasMore: false };
            }
            lookAhead = await currentIterator.next();
            return { entries, hasMore: !lookAhead.done };
          },
          lstat: async (name) => {
            const stats = await lstat(path.join(this.storage.videosDir, name));
            return {
              mtimeMs: stats.mtimeMs,
              isFile: stats.isFile(),
              isSymbolicLink: stats.isSymbolicLink(),
            };
          },
          unlink: (name) => unlink(path.join(this.storage.videosDir, name)),
          close: async () => {
            await directory?.close().catch(() => undefined);
          },
        },
        async (assetId, localKey) =>
          (await this.prisma.videoAsset.findFirst({
            where: { OR: [{ id: assetId }, { localKey }] },
            select: { id: true },
          })) !== null,
      );
      this.logger.log(
        `Local video orphan sweep: scanned=${result.scanned} deletedTemps=${result.deletedTemps} deletedOrphans=${result.deletedOrphans} failures=${result.failures} capHit=${result.capHit}`,
      );
    } catch (error) {
      this.logger.error(
        `Local video orphan sweep: scanned=0 deletedTemps=0 deletedOrphans=0 failures=1; ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
