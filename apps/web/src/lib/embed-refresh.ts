export type EmbedRefreshAction =
  'schedule' | 'refresh-now' | 'refresh-and-wait';

const REFRESH_LEAD_MS = 60_000;

/** Decide whether to schedule, refresh immediately, or defer swapping while playing. */
export function embedRefreshAction(
  now: number,
  expiresAt: string | number,
  isPlaying: boolean,
): EmbedRefreshAction {
  const expiration =
    typeof expiresAt === 'number' ? expiresAt : Date.parse(expiresAt);
  if (!Number.isFinite(expiration)) return 'refresh-now';
  if (now < expiration - REFRESH_LEAD_MS) return 'schedule';
  return isPlaying ? 'refresh-and-wait' : 'refresh-now';
}

export function embedRefreshDelay(
  now: number,
  expiresAt: string | number,
): number {
  const expiration =
    typeof expiresAt === 'number' ? expiresAt : Date.parse(expiresAt);
  return Number.isFinite(expiration)
    ? Math.max(0, expiration - REFRESH_LEAD_MS - now)
    : 0;
}
