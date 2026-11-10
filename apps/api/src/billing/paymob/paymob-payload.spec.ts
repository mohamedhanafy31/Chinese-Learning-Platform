import { readFileSync } from 'node:fs';

import { describe, expect, it } from '@jest/globals';

import {
  parseAmountMinor,
  redactPaymobPayload,
  transactionObjectSchema,
} from './paymob-payload';

const success = JSON.parse(
  readFileSync(
    new URL('../../../test/fixtures/paymob/success.json', import.meta.url),
    'utf8',
  ),
) as unknown;

describe('Paymob payload handling', () => {
  it.each([
    [0, 0],
    [125000, 125000],
    ['125000', 125000],
    ['0001', 1],
    [-1, null],
    [1.5, null],
    ['12.50', null],
    ['1e3', null],
    ['', null],
    [Number.MAX_SAFE_INTEGER + 1, null],
  ])('parses amount %p as %p', (input, output) => {
    expect(parseAmountMinor(input)).toBe(output);
  });

  it('keeps only the provider allow-list and no billing PII', () => {
    const object = transactionObjectSchema.parse(success);
    const redacted = redactPaymobPayload(object, {
      amount: true,
      currency: true,
      integration: true,
      order: true,
    });
    expect(redacted).toMatchObject({
      id: '9001001',
      source_data: {
        pan: 'xxxx-xxxx-xxxx-2346',
        sub_type: 'MasterCard',
        type: 'card',
      },
      data: { message: 'Approved' },
      validation: { valid: true },
    });
    const serialized = JSON.stringify(redacted);
    for (const privateValue of [
      'private.student@example.com',
      '+201001234567',
      'shipping@example.com',
      'never-store-this-token',
      'Private',
      'Student',
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(redacted).not.toHaveProperty('billing_data');
    expect(redacted).not.toHaveProperty('shipping_data');
    expect(redacted).not.toHaveProperty('token');
  });
});
