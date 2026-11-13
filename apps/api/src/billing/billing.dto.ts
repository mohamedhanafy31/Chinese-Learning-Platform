import type { z } from 'zod';
import { adminOrdersQuerySchema, checkoutRequestSchema } from '@app/shared';

type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export class CheckoutDto implements CheckoutRequest {
  static readonly schema = checkoutRequestSchema;

  declare levelId: CheckoutRequest['levelId'];
  declare locale: CheckoutRequest['locale'];
}

type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;

export class AdminOrdersQueryDto implements AdminOrdersQuery {
  static readonly schema = adminOrdersQuerySchema;

  declare status: AdminOrdersQuery['status'];
  declare q: AdminOrdersQuery['q'];
  declare page: AdminOrdersQuery['page'];
  declare refundedWithAccess: AdminOrdersQuery['refundedWithAccess'];
}
