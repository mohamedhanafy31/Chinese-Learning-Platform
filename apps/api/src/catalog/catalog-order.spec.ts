import { BadRequestException } from '@nestjs/common';

import { assertCompleteOrder } from './catalog-order';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const c = '33333333-3333-4333-8333-333333333333';

describe('assertCompleteOrder', () => {
  it('accepts any full permutation, including an empty scope', () => {
    expect(() => assertCompleteOrder([a, b, c], [c, a, b])).not.toThrow();
    expect(() => assertCompleteOrder([], [])).not.toThrow();
  });

  it('rejects a payload with a missing id', () => {
    expect(() => assertCompleteOrder([a, b, c], [a, b])).toThrow(
      BadRequestException,
    );
  });

  it('rejects duplicates even when the length matches', () => {
    expect(() => assertCompleteOrder([a, b, c], [a, a, b])).toThrow(
      BadRequestException,
    );
  });

  it('rejects ids outside the scope', () => {
    expect(() => assertCompleteOrder([a, b], [a, c])).toThrow(
      BadRequestException,
    );
    expect(() => assertCompleteOrder([a], [a, b])).toThrow(BadRequestException);
  });

  it('reports what was wrong', () => {
    try {
      assertCompleteOrder([a, b], [a, a, c]);
      throw new Error('expected a rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        duplicates: [a],
        unknown: [c],
        missing: [b],
      });
    }
  });
});
