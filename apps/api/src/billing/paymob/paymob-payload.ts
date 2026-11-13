import { z } from 'zod';

export interface TransactionChecks {
  amount: boolean;
  currency: boolean;
  integration: boolean;
  order: boolean;
}

export function parseAmountMinor(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function scalarId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return String(value);
  }
  return null;
}

export const transactionObjectSchema = z
  .object({
    id: z.union([z.string().min(1), z.number().int().safe()]),
    amount_cents: z.unknown(),
    created_at: z.string().min(1),
    currency: z.string().min(1),
    integration_id: z.union([z.string().min(1), z.number().int().safe()]),
    success: z.boolean(),
    pending: z.boolean(),
    is_refunded: z.boolean(),
    is_voided: z.boolean(),
    order: z.object({
      id: z.union([z.string().min(1), z.number().int().safe()]),
      merchant_order_id: z.union([z.string(), z.number()]).optional(),
    }),
    special_reference: z.union([z.string(), z.number()]).optional(),
    source_data: z
      .object({
        pan: z.unknown().optional(),
        sub_type: z.string().optional(),
        type: z.string().optional(),
      })
      .optional(),
    data: z.object({ message: z.string().optional() }).optional(),
  })
  .passthrough()
  .refine((value) => parseAmountMinor(value.amount_cents) !== null, {
    message: 'amount_cents must be a non-negative safe integer',
    path: ['amount_cents'],
  });

export type PaymobTransactionObject = z.infer<typeof transactionObjectSchema>;

/** Keep only a last-four mask. Provider PAN input is never persisted verbatim. */
function safePan(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 4 ? `xxxx-xxxx-xxxx-${digits.slice(-4)}` : null;
}

/** Explicit allow-list: billing/shipping data, tokens, email and phone vanish. */
export function redactPaymobPayload(
  object: PaymobTransactionObject,
  checks: TransactionChecks,
): Record<string, unknown> {
  return {
    id: scalarId(object.id),
    amount_cents: parseAmountMinor(object.amount_cents),
    created_at: object.created_at,
    currency: object.currency,
    integration_id: scalarId(object.integration_id),
    success: object.success,
    pending: object.pending,
    is_refunded: object.is_refunded,
    is_voided: object.is_voided,
    order: {
      id: scalarId(object.order.id),
      merchant_order_id: scalarId(object.order.merchant_order_id),
    },
    special_reference: scalarId(object.special_reference),
    source_data: {
      pan: safePan(object.source_data?.pan),
      sub_type: object.source_data?.sub_type ?? null,
      type: object.source_data?.type ?? null,
    },
    data: { message: object.data?.message ?? null },
    validation: { ...checks, valid: Object.values(checks).every(Boolean) },
  };
}
