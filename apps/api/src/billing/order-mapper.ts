import type { OrderSummary } from './billing.types';
import { parseLocalizedText } from '../catalog/catalog.mapper';
import type { Order, Prisma } from '../generated/prisma/client';

export function mapOrder(
  row: Order & { level: { slug: string; title: Prisma.JsonValue } },
): OrderSummary {
  return {
    id: row.id,
    status: row.status,
    levelId: row.levelId,
    levelSlug: row.level.slug,
    levelTitle: parseLocalizedText(row.level.title),
    amountMinor: row.amountMinor,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}
