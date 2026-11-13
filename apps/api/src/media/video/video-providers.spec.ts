import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { VideoProvider as VideoProviderKind } from '@app/shared';

import { VideoProviders, type VideoDeleteSleep } from './video-providers';
import type { VideoAssetRef, VideoProvider } from './video-provider';

const asset: VideoAssetRef = {
  id: 'asset-id',
  provider: VideoProviderKind.BUNNY,
  localKey: null,
  mime: 'video/mp4',
  bunnyVideoId: 'bunny-id',
  bunnyLibraryId: 'library-id',
};

describe('VideoProviders.discard', () => {
  it('retries provider deletes with backoff and returns on success', async () => {
    const remove = jest
      .fn<VideoProvider['delete']>()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(undefined);
    const sleep = jest.fn<VideoDeleteSleep>().mockResolvedValue(undefined);
    const local = {
      delete: jest.fn<VideoProvider['delete']>(),
    } as unknown as VideoProvider;
    const bunny = { delete: remove } as unknown as VideoProvider;
    const service = new VideoProviders(
      local as never,
      bunny as never,
      { pendingVideoDelete: { upsert: jest.fn(async () => ({})) } } as never,
      sleep,
    );

    await service.discard(asset);

    expect(remove).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([250, 1000]);
  });

  it('queues failed Bunny deletes after three attempts', async () => {
    const remove = jest
      .fn<VideoProvider['delete']>()
      .mockRejectedValue(new Error('offline'));
    const sleep = jest.fn<VideoDeleteSleep>().mockResolvedValue(undefined);
    const logger = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const upsert = jest.fn(async (args: unknown) => {
      void args;
      return {};
    });
    const prisma = { pendingVideoDelete: { upsert } };
    const local = {
      delete: jest.fn<VideoProvider['delete']>(),
    } as unknown as VideoProvider;
    const bunny = { delete: remove } as unknown as VideoProvider;
    const service = new VideoProviders(
      local as never,
      bunny as never,
      prisma as never,
      sleep,
      () => new Date('2026-11-13T08:00:00.000Z'),
    );

    await service.discard(asset);

    expect(remove).toHaveBeenCalledTimes(3);
    expect(upsert).toHaveBeenCalledWith({
      where: { bunnyVideoId: 'bunny-id' },
      create: {
        bunnyVideoId: 'bunny-id',
        bunnyLibraryId: 'library-id',
        attempts: 3,
        lastError: 'Bunny delete request failed',
        nextAttemptAt: new Date('2026-11-13T08:15:00.000Z'),
      },
      update: {
        bunnyLibraryId: 'library-id',
        attempts: 3,
        lastError: 'Bunny delete request failed',
        nextAttemptAt: new Date('2026-11-13T08:15:00.000Z'),
      },
    });
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining('retry queued'),
    );
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining('bunnyVideoId=bunny-id'),
    );
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining('libraryId=library-id'),
    );
    logger.mockRestore();
  });

  it('logs manual cleanup if the durable queue write fails', async () => {
    const remove = jest
      .fn<VideoProvider['delete']>()
      .mockRejectedValue(new Error('failure'));
    const sleep = jest.fn<VideoDeleteSleep>().mockResolvedValue(undefined);
    const upsert = jest.fn(async (args: unknown) => {
      void args;
      throw new Error('database unavailable');
    });
    const logger = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const local = { delete: jest.fn<VideoProvider['delete']>() };
    const bunny = { delete: remove };
    const service = new VideoProviders(
      local as never,
      bunny as never,
      { pendingVideoDelete: { upsert } } as never,
      sleep,
    );
    await service.discard(asset);
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining('manual cleanup required'),
    );
    logger.mockRestore();
  });
});
