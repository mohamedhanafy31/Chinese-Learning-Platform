const ENTRY_BATCH_SIZE = 1000;
export const MAX_SWEEP_ENTRIES = 20_000;
const MAX_FILE_AGE_MS = 60 * 60 * 1000;
const TEMP_NAME = /^\.upload-.+\.tmp$/;
const VIDEO_NAME =
  /^([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\.([a-z\d]+)$/i;

export interface SweepEntry {
  name: string;
  isFile: boolean;
}

export interface SweepFileStats {
  mtimeMs: number;
  isFile: boolean;
  isSymbolicLink: boolean;
}

export interface SweepFileSystem {
  readEntries(
    limit: number,
  ): Promise<{ entries: SweepEntry[]; hasMore: boolean }>;
  close?(): Promise<void>;
  lstat(name: string): Promise<SweepFileStats>;
  unlink(name: string): Promise<void>;
}

export interface OrphanSweepResult {
  scanned: number;
  deletedTemps: number;
  deletedOrphans: number;
  failures: number;
  capHit: boolean;
}

export async function sweepLocalOrphans(
  fs: SweepFileSystem,
  isReferenced: (assetId: string, localKey: string) => Promise<boolean>,
  now = Date.now(),
): Promise<OrphanSweepResult> {
  const result: OrphanSweepResult = {
    scanned: 0,
    deletedTemps: 0,
    deletedOrphans: 0,
    failures: 0,
    capHit: false,
  };
  const cutoff = now - MAX_FILE_AGE_MS;
  try {
    while (result.scanned < MAX_SWEEP_ENTRIES) {
      const batch = await fs.readEntries(
        Math.min(ENTRY_BATCH_SIZE, MAX_SWEEP_ENTRIES - result.scanned),
      );
      if (batch.entries.length === 0) break;
      for (const entry of batch.entries) {
        result.scanned++;
        if (!entry.isFile) continue;
        const temp = TEMP_NAME.test(entry.name);
        const match = VIDEO_NAME.exec(entry.name);
        if (!temp && !match) continue;

        try {
          const stats = await fs.lstat(entry.name);
          if (!stats.isFile || stats.isSymbolicLink || stats.mtimeMs >= cutoff)
            continue;
          if (temp) {
            await fs.unlink(entry.name);
            result.deletedTemps++;
            continue;
          }
          const assetId = match![1]!;
          if (await isReferenced(assetId, entry.name)) continue;
          await fs.unlink(entry.name);
          result.deletedOrphans++;
        } catch {
          result.failures++;
        }
      }
      if (result.scanned >= MAX_SWEEP_ENTRIES) {
        result.capHit = batch.hasMore;
        break;
      }
      if (!batch.hasMore) break;
    }
  } finally {
    await fs.close?.();
  }
  return result;
}
