import { readFileSync } from 'node:fs';

import { describe, expect, it } from '@jest/globals';

import { canonicalize, computeHmac, verifyHmac } from './paymob-hmac';

const secret = 'test-paymob-hmac-secret';
const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      new URL(`../../../test/fixtures/paymob/${name}.json`, import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>;

describe('Paymob HMAC', () => {
  it('matches the pinned realistic success vector', () => {
    // Re-check this vector against a captured real sandbox callback in M11.
    expect(computeHmac(fixture('success'), secret)).toBe(
      '297f887f44ebf6247c9be595022399c9c50395db91f907c6b484cc9c035d63fcc4cb1c268f909f6b696f21acf9b2a8467516f5299f7981e1e9fa1a2ecc95349f',
    );
  });

  it.each(['success', 'failed', 'pending', 'refund', 'voided', 'malformed'])(
    'produces a lowercase SHA-512 hex digest for %s',
    (name) => {
      expect(computeHmac(fixture(name), secret)).toMatch(/^[a-f\d]{128}$/);
    },
  );

  it('uses exact field order, lowercase booleans and empty nulls', () => {
    const object = {
      amount_cents: 10,
      created_at: 'when',
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: true,
      id: 7,
      integration_id: null,
      order: { id: 9 },
      pending: false,
      source_data: { pan: null, sub_type: 'Visa', type: 'card' },
      success: true,
    };
    expect(canonicalize(object)).toBe('10whenEGPfalsetrue79falseVisacardtrue');
    const swapped = { ...object, amount_cents: 'when', created_at: 10 };
    expect(computeHmac(swapped, secret)).not.toBe(computeHmac(object, secret));
  });

  it('accepts uppercase hex but rejects tampering and invalid lengths', () => {
    const object = fixture('success');
    const digest = computeHmac(object, secret);
    expect(verifyHmac(object, digest.toUpperCase(), secret)).toBe(true);
    expect(
      verifyHmac({ ...object, amount_cents: 125001 }, digest, secret),
    ).toBe(false);
    expect(verifyHmac(object, 'aa', secret)).toBe(false);
  });
});
