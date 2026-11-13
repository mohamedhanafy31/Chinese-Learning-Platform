import { describe, expect, it, jest } from '@jest/globals';

import {
  MAX_SWEEP_ENTRIES,
  sweepLocalOrphans,
  type SweepEntry,
} from './local-orphan-sweep';

const NOW = 10_000_000;
const HOUR = 60 * 60 * 1000;
const ID = '11111111-1111-4111-8111-111111111111';

describe('sweepLocalOrphans', () => {
  async function sweep(
    entries: SweepEntry[],
    mtimes: Record<string, number>,
    referenced: string[] = [],
  ) {
    const deleted: string[] = [];
    let offset = 0;
    const fs = {
      readEntries: async (limit: number) => {
        const batch = entries.slice(offset, offset + limit);
        offset += batch.length;
        return { entries: batch, hasMore: offset < entries.length };
      },
      lstat: async (name: string) => ({
        mtimeMs: mtimes[name] ?? NOW,
        isFile: true,
        isSymbolicLink: false,
      }),
      unlink: async (name: string) => void deleted.push(name),
    };
    const result = await sweepLocalOrphans(
      fs,
      async (_id, localKey) => referenced.includes(localKey),
      NOW,
    );
    return { result, deleted };
  }

  it('keeps young temps and young orphans, removes old temps and old orphans, and preserves referenced files', async () => {
    const names = [
      '.upload-young.tmp',
      '.upload-old.tmp',
      `${ID}.mp4`,
      '22222222-2222-4222-8222-222222222222.webm',
      'notes.txt',
    ];
    const { deleted } = await sweep(
      names.map((name) => ({ name, isFile: true })),
      {
        '.upload-young.tmp': NOW - HOUR + 1,
        '.upload-old.tmp': NOW - HOUR - 1,
        [`${ID}.mp4`]: NOW - HOUR - 1,
        '22222222-2222-4222-8222-222222222222.webm': NOW - HOUR - 1,
      },
      ['22222222-2222-4222-8222-222222222222.webm'],
    );
    expect(deleted).toEqual(['.upload-old.tmp', `${ID}.mp4`]);
  });

  it('processes 2500 entries over 1000-entry batches', async () => {
    const entries = Array.from({ length: 2500 }, (_, index) => ({
      name: `unknown-${index}`,
      isFile: true,
    }));
    let offset = 0;
    const readEntries = jest.fn(async (limit: number) => {
      const batch = entries.slice(offset, offset + limit);
      offset += batch.length;
      return { entries: batch, hasMore: offset < entries.length };
    });
    const fs = {
      readEntries,
      lstat: async () => ({ mtimeMs: 0, isFile: true, isSymbolicLink: false }),
      unlink: async () => undefined,
    };
    const result = await sweepLocalOrphans(fs, async () => false, NOW);
    expect(readEntries.mock.calls.map(([limit]) => limit)).toEqual([
      1000, 1000, 1000,
    ]);
    expect(result.scanned).toBe(2500);
    expect(result.deletedTemps).toBe(0);
    expect(result.deletedOrphans).toBe(0);
  });

  it('stops at 20000 processed entries and reports when more remain', async () => {
    const entries = Array.from(
      { length: MAX_SWEEP_ENTRIES + 500 },
      (_, index) => ({
        name: `unknown-${index}`,
        isFile: true,
      }),
    );
    let offset = 0;
    const readEntries = jest.fn(async (limit: number) => {
      const batch = entries.slice(offset, offset + limit);
      offset += batch.length;
      return { entries: batch, hasMore: offset < entries.length };
    });
    const result = await sweepLocalOrphans(
      {
        readEntries,
        lstat: async () => ({
          mtimeMs: 0,
          isFile: true,
          isSymbolicLink: false,
        }),
        unlink: async () => undefined,
      },
      async () => false,
      NOW,
    );
    expect(result.scanned).toBe(MAX_SWEEP_ENTRIES);
    expect(result.capHit).toBe(true);
    expect(readEntries).toHaveBeenCalledTimes(20);
  });
});
