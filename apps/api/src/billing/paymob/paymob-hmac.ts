import { createHmac, timingSafeEqual } from 'node:crypto';

const FIELD_PATHS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

function atPath(object: unknown, path: string): unknown {
  let current = object;
  for (const part of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Paymob's callback canonical form. Values have no separators. Booleans use
 * lowercase JSON spelling, numbers use decimal spelling, and null/missing
 * fields become the empty string (matching Paymob's sample implementation).
 */
export function canonicalize(object: unknown): string {
  return FIELD_PATHS.map((path) => {
    const value = atPath(object, path);
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number' || typeof value === 'string') {
      return String(value);
    }
    return String(value);
  }).join('');
}

export function computeHmac(object: unknown, secret: string): string {
  return createHmac('sha512', secret)
    .update(canonicalize(object), 'utf8')
    .digest('hex');
}

export function verifyHmac(
  object: unknown,
  received: string | undefined,
  secret: string,
): boolean {
  if (!received || !/^[a-f\d]+$/i.test(received)) return false;
  const expected = Buffer.from(computeHmac(object, secret), 'hex');
  const actual = Buffer.from(received.toLowerCase(), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
