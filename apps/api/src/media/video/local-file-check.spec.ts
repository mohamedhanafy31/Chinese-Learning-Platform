import { describe, expect, it } from '@jest/globals';

import { findMissingLocalFiles } from './local-file-check';

describe('findMissingLocalFiles', () => {
  const statOk = async () => undefined;
  const onePage =
    (rows: Array<{ id: string; localKey: string | null }>) => async () =>
      rows;

  it('counts ENOENT and ignores other stat errors', async () => {
    const result = await findMissingLocalFiles(
      onePage([
        { id: 'missing', localKey: 'missing.mp4' },
        { id: 'unreadable', localKey: 'unreadable.mp4' },
        { id: 'present', localKey: 'present.mp4' },
      ]),
      (key) => key,
      async (file) => {
        if (file === 'missing.mp4')
          throw Object.assign(new Error(), { code: 'ENOENT' });
        if (file === 'unreadable.mp4')
          throw Object.assign(new Error(), { code: 'EACCES' });
        return statOk();
      },
    );
    expect(result).toEqual({ count: 1, ids: ['missing'] });
  });

  it('caps reported ids at 20 while counting every missing file', async () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      id: `id-${index}`,
      localKey: null,
    }));
    const result = await findMissingLocalFiles(
      onePage(rows),
      (key) => key,
      statOk,
    );
    expect(result.count).toBe(25);
    expect(result.ids).toHaveLength(20);
  });

  it('paginates in bounded batches beyond 200 rows', async () => {
    const rows = Array.from({ length: 205 }, (_, index) => ({
      id: `id-${String(index).padStart(3, '0')}`,
      localKey: null,
    }));
    const calls: Array<[string | undefined, number]> = [];
    const result = await findMissingLocalFiles(
      async (cursor, take) => {
        calls.push([cursor, take]);
        const start = cursor === undefined ? 0 : Number(cursor.slice(3)) + 1;
        return rows.slice(start, start + take);
      },
      (key) => key,
      statOk,
    );
    expect(calls).toEqual([
      [undefined, 200],
      ['id-199', 200],
    ]);
    expect(result.count).toBe(205);
  });
});
