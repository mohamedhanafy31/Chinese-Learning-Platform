import { describe, expect, it } from '@jest/globals';

import { buildCheckoutUrl, splitName } from './paymob-utils';

describe('Paymob utilities', () => {
  it.each([
    ['Mohamed Hanafy', { firstName: 'Mohamed', lastName: 'Hanafy' }],
    ['Mohamed Ali Hanafy', { firstName: 'Mohamed', lastName: 'Ali Hanafy' }],
    ['محمد', { firstName: 'محمد', lastName: 'محمد' }],
    ['  Li   Wei  ', { firstName: 'Li', lastName: 'Wei' }],
  ])('splits %p', (name, expected) => {
    expect(splitName(name)).toEqual(expected);
  });

  it.each([
    'https://accept.paymob.com/unifiedcheckout/',
    'https://eg.checkout.paymob.com/',
  ])('builds checkout parameters on %s', (base) => {
    const url = new URL(buildCheckoutUrl(base, 'pk_test', 'client secret'));
    expect(url.searchParams.get('publicKey')).toBe('pk_test');
    expect(url.searchParams.get('clientSecret')).toBe('client secret');
  });
});
