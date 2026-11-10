import { randomUUID } from 'node:crypto';

import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DEFAULT_LOCALE, type PublicUser } from '@app/shared';

import type { CheckoutDto, AdminOrdersQueryDto } from './billing.dto';
import type {
  AdminOrderSummary,
  CheckoutResponse,
  OrderSummary,
} from './billing.types';
import { PaymobClient } from './paymob/paymob.client';
import { PaymobConfig } from './paymob/paymob.config';
import { buildCheckoutUrl, splitName } from './paymob/paymob-utils';
import { parseLocalizedText } from '../catalog/catalog.mapper';
import {
  OrderStatus,
  Role,
  type Order,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CREATION_LEASE_PREFIX = 'creating:';
const CREATION_LEASE_STALE_MS = 20_000;
const FOLLOWER_WAIT_MS = 18_000;
const FOLLOWER_POLL_MS = 50;
const PAGE_SIZE = 20;

type CheckoutDecision =
  | { action: 'ready'; order: Order & { checkoutUrl: string } }
  | { action: 'wait'; order: Order }
  | { action: 'create'; order: Order; user: PublicUser; itemName: string };

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PaymobConfig) private readonly config: PaymobConfig,
    @Inject(PaymobClient) private readonly paymob: PaymobClient,
  ) {}

  async checkout(
    user: PublicUser,
    input: CheckoutDto,
    attempt = 0,
  ): Promise<CheckoutResponse> {
    const settings = this.config.settings;
    if (!settings) {
      throw new ServiceUnavailableException({
        reason: 'payments-unavailable',
      });
    }

    const decision = await this.reserveCheckout(user, input);
    if (decision.action === 'ready') return checkoutResponse(decision.order);
    if (decision.action === 'wait') {
      const reused = await this.waitForCheckout(decision.order.id);
      if (reused) return reused;
      if (attempt < 1) return this.checkout(user, input, attempt + 1);
      throw new BadGatewayException({ reason: 'provider-error' });
    }

    const { firstName, lastName } = splitName(decision.user.name);
    try {
      const intention = await this.paymob.createIntention({
        amountMinor: decision.order.amountMinor,
        currency: 'EGP',
        integrationIds: settings.integrationIds,
        items: [
          {
            name: decision.itemName,
            amount: decision.order.amountMinor,
            description: decision.itemName,
            quantity: 1,
          },
        ],
        billingData: {
          firstName,
          lastName,
          email: decision.user.email,
          phoneNumber: decision.user.phone,
        },
        specialReference: decision.order.specialReference,
        notificationUrl: `${this.config.apiPublicOrigin}/api/v1/webhooks/paymob`,
        redirectionUrl: `${this.config.appUrl}/${input.locale}/checkout/result?order=${decision.order.id}`,
      });
      const checkoutUrl = buildCheckoutUrl(
        settings.checkoutBase,
        settings.publicKey,
        intention.clientSecret,
      );
      const stored = await this.prisma.order.updateMany({
        where: {
          id: decision.order.id,
          status: OrderStatus.PENDING,
          paymobIntentionId: decision.order.paymobIntentionId,
        },
        data: {
          paymobIntentionId: intention.id,
          paymobOrderId: intention.intentionOrderId,
          clientSecret: intention.clientSecret,
          checkoutUrl,
        },
      });
      if (stored.count !== 1) {
        this.logger.error(
          `Paymob intention was created but order ${decision.order.id} could not be finalized`,
        );
        throw new Error('Checkout reservation was lost');
      }
      return {
        orderId: decision.order.id,
        checkoutUrl,
        expiresAt: decision.order.expiresAt.toISOString(),
      };
    } catch (error) {
      await this.prisma.order.updateMany({
        where: {
          id: decision.order.id,
          status: OrderStatus.PENDING,
          paymobIntentionId: decision.order.paymobIntentionId,
        },
        data: { status: OrderStatus.CANCELED },
      });
      this.logger.error(
        `Paymob checkout failed for order ${decision.order.id}: ${safeMessage(error)}`,
      );
      throw new BadGatewayException({ reason: 'provider-error' });
    }
  }

  private reserveCheckout(
    user: PublicUser,
    input: CheckoutDto,
  ): Promise<CheckoutDecision> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing:${user.id}:${input.levelId}`}))`;
      const now = new Date();
      const level = await tx.level.findUnique({ where: { id: input.levelId } });
      if (
        !level ||
        !level.isPublished ||
        level.archivedAt ||
        level.priceMinor === null ||
        level.priceMinor <= 0 ||
        level.currency !== 'EGP'
      ) {
        throw new ConflictException({ reason: 'not-for-sale' });
      }
      const enrollment = await tx.enrollment.findUnique({
        where: { userId_levelId: { userId: user.id, levelId: level.id } },
        select: { revokedAt: true },
      });
      if (enrollment?.revokedAt === null) {
        throw new ConflictException({ reason: 'already-enrolled' });
      }
      await tx.order.updateMany({
        where: {
          userId: user.id,
          levelId: level.id,
          status: OrderStatus.PENDING,
          expiresAt: { lte: now },
        },
        data: { status: OrderStatus.EXPIRED },
      });
      await tx.order.updateMany({
        where: {
          userId: user.id,
          levelId: level.id,
          status: OrderStatus.PENDING,
          OR: [
            { amountMinor: { not: level.priceMinor } },
            { currency: { not: 'EGP' } },
          ],
        },
        data: { status: OrderStatus.CANCELED },
      });
      const existing = await tx.order.findFirst({
        where: {
          userId: user.id,
          levelId: level.id,
          status: OrderStatus.PENDING,
          amountMinor: level.priceMinor,
          currency: 'EGP',
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing?.checkoutUrl) {
        return {
          action: 'ready' as const,
          order: { ...existing, checkoutUrl: existing.checkoutUrl },
        };
      }
      if (
        existing?.paymobIntentionId?.startsWith(CREATION_LEASE_PREFIX) &&
        existing.updatedAt.getTime() > now.getTime() - CREATION_LEASE_STALE_MS
      ) {
        return { action: 'wait' as const, order: existing };
      }
      if (existing) {
        await tx.order.update({
          where: { id: existing.id },
          data: { status: OrderStatus.CANCELED },
        });
      }
      const specialReference = randomUUID();
      const order = await tx.order.create({
        data: {
          userId: user.id,
          levelId: level.id,
          amountMinor: level.priceMinor,
          currency: 'EGP',
          specialReference,
          paymobIntentionId: `${CREATION_LEASE_PREFIX}${specialReference}`,
          expiresAt: new Date(
            now.getTime() + this.config.orderTtlMinutes * 60_000,
          ),
        },
      });
      const title = parseLocalizedText(level.title);
      const itemName =
        title[input.locale as keyof typeof title] ??
        title[DEFAULT_LOCALE] ??
        title.en;
      return { action: 'create' as const, order, user, itemName };
    });
  }

  private async waitForCheckout(
    orderId: string,
  ): Promise<CheckoutResponse | null> {
    const deadline = Date.now() + FOLLOWER_WAIT_MS;
    while (Date.now() < deadline) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });
      if (!order || order.status !== OrderStatus.PENDING) return null;
      if (order.checkoutUrl)
        return checkoutResponse({ ...order, checkoutUrl: order.checkoutUrl });
      await new Promise<void>((resolve) =>
        setTimeout(resolve, FOLLOWER_POLL_MS),
      );
    }
    return null;
  }

  async getOrder(id: string, user: PublicUser): Promise<OrderSummary> {
    const row = await this.prisma.order.findFirst({
      where: { id, ...(user.role === Role.ADMIN ? {} : { userId: user.id }) },
      include: { level: { select: { slug: true } } },
    });
    if (!row) throw new NotFoundException('Order not found');
    return mapOrder(row);
  }

  async listOwnOrders(userId: string): Promise<{ orders: OrderSummary[] }> {
    const rows = await this.prisma.order.findMany({
      where: { userId },
      include: { level: { select: { slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { orders: rows.map(mapOrder) };
  }

  async listAdmin(query: AdminOrdersQueryDto): Promise<{
    orders: AdminOrderSummary[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const where: Prisma.OrderWhereInput = {
      status: query.status,
      ...(query.q
        ? {
            user: {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' } },
                { email: { contains: query.q, mode: 'insensitive' } },
                { phone: { contains: query.q } },
              ],
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          level: { select: { slug: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      orders: rows.map((row) => ({
        ...mapOrder(row),
        user: row.user,
        levelTitle: parseLocalizedText(row.level.title),
      })),
      page: query.page,
      pageSize: PAGE_SIZE,
      total,
    };
  }

  async getAdminOrder(id: string): Promise<Record<string, unknown>> {
    const row = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        level: { select: { slug: true, title: true } },
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!row) throw new NotFoundException('Order not found');
    return {
      ...mapOrder(row),
      specialReference: row.specialReference,
      paymobIntentionId: row.paymobIntentionId,
      paymobOrderId: row.paymobOrderId,
      user: row.user,
      levelTitle: parseLocalizedText(row.level.title),
      transactions: row.transactions.map((transaction) => ({
        id: transaction.id,
        providerTransactionId: transaction.providerTransactionId,
        integrationId: transaction.integrationId,
        success: transaction.success,
        pending: transaction.pending,
        isRefund: transaction.isRefund,
        isVoided: transaction.isVoided,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        payloadRedacted: transaction.payloadRedacted,
        occurredAt: transaction.occurredAt.toISOString(),
        createdAt: transaction.createdAt.toISOString(),
      })),
    };
  }
}

function mapOrder(row: Order & { level: { slug: string } }): OrderSummary {
  return {
    id: row.id,
    status: row.status,
    levelId: row.levelId,
    levelSlug: row.level.slug,
    amountMinor: row.amountMinor,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

function checkoutResponse(
  order: Order & { checkoutUrl: string },
): CheckoutResponse {
  return {
    orderId: order.id,
    checkoutUrl: order.checkoutUrl,
    expiresAt: order.expiresAt.toISOString(),
  };
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown provider error';
}
