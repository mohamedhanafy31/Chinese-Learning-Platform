import type { LocalizedText } from '@app/shared';

import type { OrderStatus } from '../generated/prisma/client';

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  levelId: string;
  levelSlug: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string;
}

export interface CheckoutResponse {
  orderId: string;
  checkoutUrl: string;
  expiresAt: string;
}

export interface AdminOrderSummary extends OrderSummary {
  user: { id: string; name: string; email: string; phone: string };
  levelTitle: LocalizedText;
}
