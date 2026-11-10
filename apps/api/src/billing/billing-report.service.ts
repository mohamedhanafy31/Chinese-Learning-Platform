import { Inject, Injectable } from '@nestjs/common';

import { WebhookProvider } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingReportService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async last24Hours(now = new Date()): Promise<{
    since: string;
    callbacksWithMismatches: number;
    callbacksWithoutMatchingOrder: number;
    paidOrdersWithoutEnrollment: number;
  }> {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [events, transactions, paidWithoutEnrollment] = await Promise.all([
      this.prisma.webhookEvent.findMany({
        where: { provider: WebhookProvider.PAYMOB, receivedAt: { gte: since } },
        select: { externalEventId: true },
      }),
      this.prisma.paymentTransaction.findMany({
        where: { createdAt: { gte: since } },
        select: { providerTransactionId: true, payloadRedacted: true },
      }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "Order" o
        WHERE o.status = 'PAID'::"OrderStatus"
          AND o."updatedAt" >= ${since}
          AND NOT EXISTS (
            SELECT 1 FROM "Enrollment" e
            WHERE e."userId" = o."userId"
              AND e."levelId" = o."levelId"
              AND e."revokedAt" IS NULL
          )
      `,
    ]);
    const matched = new Set(
      transactions.map((transaction) => transaction.providerTransactionId),
    );
    return {
      since: since.toISOString(),
      callbacksWithMismatches: transactions.filter(
        (transaction) =>
          validationOf(transaction.payloadRedacted)?.valid === false,
      ).length,
      callbacksWithoutMatchingOrder: events.filter(
        (event) => !matched.has(event.externalEventId),
      ).length,
      paidOrdersWithoutEnrollment: Number(
        paidWithoutEnrollment[0]?.count ?? 0n,
      ),
    };
  }
}

function validationOf(value: unknown): { valid?: unknown } | null {
  if (typeof value !== 'object' || value === null) return null;
  const validation = (value as Record<string, unknown>).validation;
  return typeof validation === 'object' && validation !== null
    ? (validation as { valid?: unknown })
    : null;
}
