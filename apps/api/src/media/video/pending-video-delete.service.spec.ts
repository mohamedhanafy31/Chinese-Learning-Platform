import { describe, expect, it, jest } from '@jest/globals';

import { BunnyError } from './bunny/bunny.client';
import type { BunnyClient } from './bunny/bunny.client';
import {
  PendingVideoDeleteService,
  pendingVideoDeleteBackoffMs,
} from './pending-video-delete.service';

const NOW = new Date('2026-11-13T08:00:00.000Z');
const row = {
  id: 'row-1',
  bunnyVideoId: 'video-1',
  bunnyLibraryId: 'library-1',
  attempts: 3,
  lastError: 'unavailable',
  nextAttemptAt: NOW,
  createdAt: NOW,
};

function setup(
  rows = [row],
  deleteVideo = jest.fn<BunnyClient['deleteVideo']>().mockResolvedValue(),
) {
  const findMany = jest.fn(async (args: Record<string, unknown>) =>
    rows.slice(0, Number(args.take)),
  );
  const deleteMany = jest.fn(async (args: { where: { id: string } }) => {
    return { count: args.where.id ? 1 : 0 };
  });
  const updateMany = jest.fn(async (args: unknown) => {
    void args;
    return { count: 1 };
  });
  const prisma = {
    pendingVideoDelete: { findMany, deleteMany, updateMany },
  };
  const service = new PendingVideoDeleteService(
    prisma as never,
    { deleteVideo } as never,
    () => new Date(NOW),
  );
  return { service, findMany, deleteMany, updateMany, deleteVideo };
}

describe('pending Bunny video delete retries', () => {
  it.each([
    [3, 15 * 60_000],
    [4, 30 * 60_000],
    [5, 60 * 60_000],
    [30, 24 * 60 * 60_000],
  ])('computes capped backoff for %i attempts', (attempts, expected) => {
    expect(pendingVideoDeleteBackoffMs(attempts)).toBe(expected);
  });

  it('deletes a queued row after successful provider deletion', async () => {
    const { service, deleteVideo, deleteMany, findMany } = setup();
    await expect(service.retryDue()).resolves.toEqual({
      checked: 1,
      deleted: 1,
      rescheduled: 0,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { nextAttemptAt: { lte: NOW } },
      orderBy: { nextAttemptAt: 'asc' },
      take: 50,
    });
    expect(deleteVideo).toHaveBeenCalledWith('video-1', 'library-1');
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'row-1' } });
  });

  it('treats a Bunny 404 as already deleted', async () => {
    const remove = jest
      .fn<BunnyClient['deleteVideo']>()
      .mockRejectedValue(new BunnyError('gone', 404));
    const { service, deleteMany } = setup([row], remove);
    await expect(service.retryDue()).resolves.toMatchObject({ deleted: 1 });
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  it('reschedules failures with a truncated safe error and exponential delay', async () => {
    const remove = jest
      .fn<BunnyClient['deleteVideo']>()
      .mockRejectedValue(new BunnyError('x'.repeat(600), 500));
    const { service, updateMany } = setup([row], remove);
    await expect(service.retryDue()).resolves.toMatchObject({ rescheduled: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: {
        attempts: 4,
        lastError: 'x'.repeat(500),
        nextAttemptAt: new Date(NOW.getTime() + 30 * 60_000),
      },
    });
  });

  it('does not overlap concurrent retry passes', async () => {
    let release: (() => void) | undefined;
    const remove = jest.fn<BunnyClient['deleteVideo']>(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const { service, findMany } = setup([row], remove);
    const first = service.retryDue();
    await Promise.resolve();
    await Promise.resolve();
    await expect(service.retryDue()).resolves.toEqual({
      checked: 0,
      deleted: 0,
      rescheduled: 0,
    });
    release?.();
    await first;
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('requests and processes no more than 50 due rows per pass', async () => {
    const rows = Array.from({ length: 55 }, (_, index) => ({
      ...row,
      id: `row-${index}`,
      bunnyVideoId: `video-${index}`,
    }));
    const { service, deleteVideo, findMany } = setup(rows);
    await service.retryDue();
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ take: 50 });
    expect(deleteVideo).toHaveBeenCalledTimes(50);
  });
});
