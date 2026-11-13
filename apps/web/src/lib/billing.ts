import 'server-only';

import { notFound } from 'next/navigation';

import {
  adminOrderDetailSchema,
  adminOrdersResponseSchema,
  billingReportSchema,
  orderSummarySchema,
  ownOrdersResponseSchema,
  type AdminOrderDetail,
  type AdminOrdersResponse,
  type BillingReport,
  type OrderStatus,
  type OrderSummary,
} from '@app/shared';

import { apiServerFetch } from '@/lib/api-server';

async function getJson(path: string): Promise<Response | null> {
  try {
    return await apiServerFetch(path, { signal: AbortSignal.timeout(4000) });
  } catch {
    return null;
  }
}

export async function getOrder(id: string): Promise<OrderSummary> {
  const response = await getJson(
    `/api/v1/billing/orders/${encodeURIComponent(id)}`,
  );
  if (!response || response.status === 400 || response.status === 404) {
    notFound();
  }
  if (!response.ok)
    throw new Error(`Order request failed (${response.status})`);
  return orderSummarySchema.parse(await response.json());
}

export async function getOwnOrders(): Promise<OrderSummary[]> {
  const response = await getJson('/api/v1/billing/orders');
  if (!response?.ok) throw new Error('Order history could not be loaded');
  return ownOrdersResponseSchema.parse(await response.json()).orders;
}

export async function getAdminOrders(input: {
  page: number;
  q: string;
  status?: OrderStatus;
  refundedWithAccess?: boolean;
}): Promise<AdminOrdersResponse> {
  const query = new URLSearchParams({ page: String(input.page) });
  if (input.q) query.set('q', input.q);
  if (input.status) query.set('status', input.status);
  if (input.refundedWithAccess) query.set('refundedWithAccess', 'true');
  const response = await getJson(`/api/v1/admin/orders?${query}`);
  if (!response?.ok) throw new Error('Admin orders could not be loaded');
  return adminOrdersResponseSchema.parse(await response.json());
}

export async function getAdminOrder(id: string): Promise<AdminOrderDetail> {
  const response = await getJson(
    `/api/v1/admin/orders/${encodeURIComponent(id)}`,
  );
  if (!response || response.status === 400 || response.status === 404) {
    notFound();
  }
  if (!response.ok) throw new Error('Admin order could not be loaded');
  return adminOrderDetailSchema.parse(await response.json());
}

export async function getBillingReport(): Promise<BillingReport> {
  const response = await getJson('/api/v1/admin/billing/report');
  if (!response?.ok) throw new Error('Billing report could not be loaded');
  return billingReportSchema.parse(await response.json());
}
