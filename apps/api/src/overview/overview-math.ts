/**
 * Money is integer minor units (EGP piasters) end to end. A fractional or
 * unsafe total means a bug upstream, so it fails loudly instead of rounding.
 */
export function toMinorTotal(value: number | null | undefined): number {
  const total = value ?? 0;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError(`Invalid revenue total: ${String(total)}`);
  }
  return total;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function daysAgo(days: number, now: Date): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
