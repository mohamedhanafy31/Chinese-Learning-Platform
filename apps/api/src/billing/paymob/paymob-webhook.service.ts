import { Inject, Injectable, Logger } from '@nestjs/common';
import { EnrollmentSource } from '@app/shared';

import { decideOrderTransition } from '../order-transition';
import { PaymobConfig } from './paymob.config';
import {
  parseAmountMinor,
  redactPaymobPayload,
  scalarId,
  transactionObjectSchema,
  type TransactionChecks,
} from './paymob-payload';
import {
  OrderStatus,
  Prisma,
  WebhookProvider,
} from '../../generated/prisma/client';
import { EnrollmentService } from '../../learning/enrollment.service';
import { PrismaService } from '../../prisma/prisma.service';

export type PaymobWebhookOutcome =
  'applied' | 'duplicate' | 'ignored' | 'recorded-mismatch';

@Injectable()
export class PaymobWebhookService {
  private readonly logger = new Logger(PaymobWebhookService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EnrollmentService)
    private readonly enrollments: EnrollmentService,
    @Inject(PaymobConfig) private readonly config: PaymobConfig,
  ) {}

  async handle(object: unknown): Promise<PaymobWebhookOutcome> {
    const parsed = transactionObjectSchema.safeParse(object);
    if (!parsed.success) {
      this.logger.warn(
        'Ignored a signed Paymob transaction with an unknown shape',
      );
      return 'ignored';
    }
    const transaction = parsed.data;
    const providerTransactionId = scalarId(transaction.id) as string;
    const alreadySeen = await this.prisma.webhookEvent.findUnique({
      where: {
        provider_externalEventId: {
          provider: WebhookProvider.PAYMOB,
          externalEventId: providerTransactionId,
        },
      },
      select: { id: true },
    });
    if (alreadySeen) return 'duplicate';

    const providerOrderId = scalarId(transaction.order.id);
    const references = [
      scalarId(transaction.order.merchant_order_id),
      scalarId(transaction.special_reference),
    ].filter((value): value is string => Boolean(value));
    const order = providerOrderId
      ? await this.prisma.order.findFirst({
          where: {
            specialReference: { in: references },
            paymobOrderId: providerOrderId,
          },
        })
      : null;
    if (!order) {
      await this.rememberIgnored(providerTransactionId);
      this.logger.warn(
        `Ignored Paymob transaction ${providerTransactionId}: no matching order`,
      );
      return 'ignored';
    }

    const amountMinor = parseAmountMinor(transaction.amount_cents);
    if (amountMinor === null) return 'ignored';
    const integrationId = scalarId(transaction.integration_id) as string;
    const checks: TransactionChecks = {
      order: true,
      amount: amountMinor === order.amountMinor,
      currency: transaction.currency === order.currency,
      integration: this.configuredIntegrationIds().has(integrationId),
    };
    const checksPass = Object.values(checks).every(Boolean);
    const occurredAt = parseOccurredAt(transaction.created_at);

    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "Order" WHERE id = ${order.id}::uuid FOR UPDATE`;
        const locked = await tx.order.findUniqueOrThrow({
          where: { id: order.id },
        });
        await tx.webhookEvent.create({
          data: {
            provider: WebhookProvider.PAYMOB,
            externalEventId: providerTransactionId,
          },
        });
        await tx.paymentTransaction.create({
          data: {
            orderId: locked.id,
            providerTransactionId,
            integrationId,
            success: transaction.success,
            pending: transaction.pending,
            isRefund: transaction.is_refunded,
            isVoided: transaction.is_voided,
            amountMinor,
            currency: transaction.currency,
            payloadRedacted: redactPaymobPayload(
              transaction,
              checks,
            ) as Prisma.InputJsonValue,
            occurredAt,
          },
        });
        const transition = decideOrderTransition(
          locked.status,
          {
            success: transaction.success,
            pending: transaction.pending,
            isRefund: transaction.is_refunded,
            isVoided: transaction.is_voided,
          },
          checksPass,
        );
        if (transition.nextStatus !== locked.status) {
          await tx.order.update({
            where: { id: locked.id },
            data: {
              status: transition.nextStatus,
              paidAt:
                transition.nextStatus === OrderStatus.PAID
                  ? occurredAt
                  : undefined,
            },
          });
        }
        if (transition.enroll) {
          await this.enrollments.grantInTransaction(
            tx,
            locked.userId,
            locked.levelId,
            EnrollmentSource.PURCHASE,
            undefined,
            locked.id,
          );
        }
        return checksPass ? 'applied' : 'recorded-mismatch';
      });
      if (!checksPass) {
        const failed = Object.entries(checks)
          .filter(([, valid]) => !valid)
          .map(([name]) => name)
          .join(',');
        this.logger.warn(
          `Recorded Paymob transaction ${providerTransactionId} for order ${order.id} with mismatches: ${failed}`,
        );
      } else if (transaction.success && transaction.is_refunded) {
        this.logger.warn(
          `Order ${order.id} was refunded; enrollment remains active for manual admin review`,
        );
      }
      return outcome;
    } catch (error) {
      if (isUniqueViolation(error)) return 'duplicate';
      throw error;
    }
  }

  private configuredIntegrationIds(): Set<string> {
    return new Set(
      (this.config.settings?.integrationIds ?? []).map((id) => String(id)),
    );
  }

  private async rememberIgnored(externalEventId: string): Promise<void> {
    try {
      await this.prisma.webhookEvent.create({
        data: { provider: WebhookProvider.PAYMOB, externalEventId },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
}

function parseOccurredAt(value: string): Date {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
