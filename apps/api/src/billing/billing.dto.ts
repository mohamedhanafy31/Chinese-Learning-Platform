import { z } from 'zod';
import { checkoutRequestSchema } from '@app/shared';

import { OrderStatus } from '../generated/prisma/client';

type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export class CheckoutDto implements CheckoutRequest {
  static readonly schema = checkoutRequestSchema;

  declare levelId: CheckoutRequest['levelId'];
  declare locale: CheckoutRequest['locale'];
}

export const adminOrdersQuerySchema = z.object({
  status: z.enum(OrderStatus).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;

export class AdminOrdersQueryDto implements AdminOrdersQuery {
  static readonly schema = adminOrdersQuerySchema;

  declare status: AdminOrdersQuery['status'];
  declare q: AdminOrdersQuery['q'];
  declare page: AdminOrdersQuery['page'];
}
