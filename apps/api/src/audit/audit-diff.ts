import { isDeepStrictEqual } from 'node:util';

/**
 * Field names that never reach an audit row, not even as a "changed" marker:
 * anything that could carry a credential, token, client secret or card data.
 */
const SECRET_FIELD =
  /pass(word|phrase)|hash|token|secret|card|cvv|pan\b|api[-_]?key|authorization|cookie|signature|hmac/i;

/**
 * Personal identifiers: the field name may be recorded as "changed", but the
 * value never is.
 */
const MARKER_ONLY_FIELDS = new Set(['email', 'phone']);

export function isSecretField(field: string): boolean {
  return SECRET_FIELD.test(field);
}

export interface AuditDiff {
  /** Names of the fields whose value changed, in the order requested. */
  changed: string[];
  /** Before and after values, only for the safe fields that were asked for. */
  values: Record<string, { from: unknown; to: unknown }>;
}

function normalise(value: unknown): unknown {
  return value === undefined ? null : value;
}

/**
 * Compares two snapshots on the listed fields. Unchanged fields are skipped
 * and secret fields are never included. `valueFields` are the safe fields
 * (title, slug, price, flags) whose before and after values are recorded as
 * well; every other changed field is recorded by name only.
 */
export function diffAudit(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
  valueFields: readonly string[] = [],
): AuditDiff {
  const changed: string[] = [];
  const values: AuditDiff['values'] = {};
  const withValues = new Set(valueFields);
  for (const field of fields) {
    if (isSecretField(field)) continue;
    const from = normalise(before[field]);
    const to = normalise(after[field]);
    if (isDeepStrictEqual(from, to)) continue;
    changed.push(field);
    if (withValues.has(field) && !MARKER_ONLY_FIELDS.has(field)) {
      values[field] = { from, to };
    }
  }
  return { changed, values };
}

/** The `data` payload for a diff: `{ changed, values? }`. */
export function diffData(diff: AuditDiff): Record<string, unknown> {
  return Object.keys(diff.values).length > 0
    ? { changed: diff.changed, values: diff.values }
    : { changed: diff.changed };
}

/**
 * Last line of defence for `data`: drops any key that looks secret and
 * replaces personal identifiers by a marker, at any depth.
 */
export function scrubAuditData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubAuditData);
  if (typeof value !== 'object' || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSecretField(key)) continue;
    result[key] = MARKER_ONLY_FIELDS.has(key)
      ? 'changed'
      : scrubAuditData(item);
  }
  return result;
}
