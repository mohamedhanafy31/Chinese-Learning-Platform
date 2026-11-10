import { describe, expect, it } from '@jest/globals';

import {
  decideOrderTransition,
  type TransactionFlags,
} from './order-transition';
import type { OrderStatus } from '../generated/prisma/client';

const success: TransactionFlags = {
  success: true,
  pending: false,
  isRefund: false,
  isVoided: false,
};

describe('order transition', () => {
  it.each<[OrderStatus, TransactionFlags, boolean, OrderStatus, boolean]>([
    ['PENDING', success, true, 'PAID', true],
    ['EXPIRED', success, true, 'PAID', true],
    ['CANCELED', success, true, 'PAID', true],
    ['PAID', success, true, 'PAID', false],
    ['PENDING', { ...success, success: false }, true, 'PENDING', false],
    ['PENDING', { ...success, pending: true }, true, 'PENDING', false],
    ['PENDING', { ...success, isVoided: true }, true, 'PENDING', false],
    ['PENDING', success, false, 'PENDING', false],
    ['PAID', { ...success, isRefund: true }, true, 'REFUNDED', false],
    ['PENDING', { ...success, isRefund: true }, true, 'PENDING', false],
  ])(
    '%s with flags and checks=%s -> %s/enroll=%s',
    (current, flags, checks, next, enroll) => {
      expect(decideOrderTransition(current, flags, checks)).toEqual({
        nextStatus: next,
        enroll,
      });
    },
  );
});
