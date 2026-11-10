import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { PaymobConfig } from './paymob/paymob.config';
import { OrderStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingExpiryService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PaymobConfig) private readonly config: PaymobConfig,
  ) {}

  onModuleInit(): void {
    const seconds = this.config.expiryIntervalSeconds;
    if (seconds <= 0) return;
    this.timer = setInterval(() => void this.expireOnce(), seconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async expireOnce(now = new Date()): Promise<{ expired: number }> {
    if (this.running) return { expired: 0 };
    this.running = true;
    try {
      const result = await this.prisma.order.updateMany({
        where: { status: OrderStatus.PENDING, expiresAt: { lt: now } },
        data: { status: OrderStatus.EXPIRED },
      });
      return { expired: result.count };
    } catch (error) {
      this.logger.error(
        `Billing expiry run failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw error;
    } finally {
      this.running = false;
    }
  }
}
