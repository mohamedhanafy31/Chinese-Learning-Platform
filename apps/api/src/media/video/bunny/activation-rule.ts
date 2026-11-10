export interface VideoAge {
  id: string;
  createdAt: Date;
}

export type ReadyDecision =
  /** Already the lesson's active video: nothing to do. */
  | 'keep'
  /** Becomes the active video; the previous one is retired. */
  | 'activate'
  /** A newer video is active already; this late arrival is deleted. */
  | 'discard';

/**
 * PLAN section 6 activation rule for an asset that just turned READY: it takes
 * over only when it is newer than the current active asset, so a slow encode
 * of an older upload can never replace a newer one. Creation time decides,
 * with the id as a deterministic tiebreak.
 */
export function decideReady(
  asset: VideoAge,
  active: VideoAge | null,
): ReadyDecision {
  if (!active) return 'activate';
  if (active.id === asset.id) return 'keep';
  const delta = asset.createdAt.getTime() - active.createdAt.getTime();
  if (delta > 0 || (delta === 0 && asset.id > active.id)) return 'activate';
  return 'discard';
}
