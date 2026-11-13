import { describe, expect, it } from 'vitest';

import { ordersHref } from './orders-paging';

describe('ordersHref', () => {
  it('preserves the refunded access filter across pages', () => {
    expect(
      ordersHref('en', {
        q: 'learner',
        refundedWithAccess: true,
        page: 2,
      }),
    ).toBe('/en/admin/orders?q=learner&refundedWithAccess=true&page=2');
  });
});
