import { z } from 'zod';
import { Locale } from '@app/shared';

import { OrderStatus } from '../generated/prisma/client';

export const checkoutRequestSchema = z.object({
  levelId: z.uuid(),
  locale: z.enum(Locale).default(Locale.AR),
});

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
