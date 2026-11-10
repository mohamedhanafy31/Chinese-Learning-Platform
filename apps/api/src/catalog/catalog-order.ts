import { BadRequestException } from '@nestjs/common';

/**
 * A reorder payload must name every row in the scope exactly once. Anything
 * missing, repeated or foreign to the scope is rejected with a 400.
 */
export function assertCompleteOrder(
  existingIds: readonly string[],
  requestedIds: readonly string[],
): void {
  const existing = new Set(existingIds);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const unknown = new Set<string>();

  for (const id of requestedIds) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
    if (!existing.has(id)) unknown.add(id);
  }
  const missing = existingIds.filter((id) => !seen.has(id));

  if (duplicates.size || unknown.size || missing.length) {
    throw new BadRequestException({
      message: 'ids must contain every item in scope exactly once',
      duplicates: [...duplicates],
      unknown: [...unknown],
      missing,
    });
  }
}
