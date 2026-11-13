export interface LocalFileRecord {
  id: string;
  localKey: string | null;
}

export interface LocalFileCheckResult {
  count: number;
  ids: string[];
}

const PAGE_SIZE = 200;
const MAX_REPORTED_IDS = 20;

/** Scan ready local assets without loading an unbounded result set. */
export async function findMissingLocalFiles(
  fetchPage: (
    cursor: string | undefined,
    take: number,
  ) => Promise<LocalFileRecord[]>,
  pathFor: (localKey: string) => string,
  statFile: (file: string) => Promise<unknown>,
): Promise<LocalFileCheckResult> {
  let cursor: string | undefined;
  let count = 0;
  const ids: string[] = [];
  while (true) {
    const batch = await fetchPage(cursor, PAGE_SIZE);
    for (const asset of batch) {
      if (asset.localKey === null) {
        count++;
        if (ids.length < MAX_REPORTED_IDS) ids.push(asset.id);
        continue;
      }
      try {
        await statFile(pathFor(asset.localKey));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          count++;
          if (ids.length < MAX_REPORTED_IDS) ids.push(asset.id);
        }
      }
    }
    if (batch.length < PAGE_SIZE) break;
    cursor = batch[batch.length - 1]!.id;
  }
  return { count, ids };
}
