import type { OrderStatus } from '../generated/prisma/client';

export interface TransactionFlags {
  success: boolean;
  pending: boolean;
  isRefund: boolean;
  isVoided: boolean;
}

export interface OrderTransition {
  nextStatus: OrderStatus;
  enroll: boolean;
}

/** Pure financial state machine; callback validation gates every transition. */
export function decideOrderTransition(
  current: OrderStatus,
  transaction: TransactionFlags,
  checksPass: boolean,
): OrderTransition {
  if (!checksPass || !transaction.success || transaction.pending) {
    return { nextStatus: current, enroll: false };
  }
  if (transaction.isRefund) {
    return {
      nextStatus: current === 'PAID' ? 'REFUNDED' : current,
      enroll: false,
    };
  }
  // CANCELED is included on purpose: we cancel orders ourselves (price
  // change, superseded checkout), but the learner may still pay on the open
  // Paymob page. A verified payment of the order's own amount must enroll
  // them, never leave them charged without access.
  if (
    !transaction.isVoided &&
    (current === 'PENDING' || current === 'EXPIRED' || current === 'CANCELED')
  ) {
    return { nextStatus: 'PAID', enroll: true };
  }
  return { nextStatus: current, enroll: false };
}
