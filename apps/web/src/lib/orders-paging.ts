import { OrderStatus, type Locale } from '@app/shared';

export function parseOrdersPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function parseOrderStatus(
  value: string | string[] | undefined,
): OrderStatus | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return Object.values(OrderStatus).find((status) => status === raw);
}

export function ordersHref(
  locale: Locale,
  input: {
    page?: number;
    q?: string;
    status?: OrderStatus;
    refundedWithAccess?: boolean;
  },
): string {
  const query = new URLSearchParams();
  if (input.q) query.set('q', input.q);
  if (input.status) query.set('status', input.status);
  if (input.refundedWithAccess) query.set('refundedWithAccess', 'true');
  if (input.page && input.page > 1) query.set('page', String(input.page));
  const suffix = query.toString();
  return `/${locale}/admin/orders${suffix ? `?${suffix}` : ''}`;
}

export function orderPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
