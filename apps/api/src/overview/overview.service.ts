import { Inject, Injectable } from '@nestjs/common';
import { Role, type AdminOverview } from '@app/shared';

import { daysAgo, toMinorTotal } from './overview-math';
import { BillingReportService } from '../billing/billing-report.service';
import { BillingService } from '../billing/billing.service';
import { OrderStatus } from '../generated/prisma/client';
import { VideoService } from '../media/video/video.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OverviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(BillingReportService) private readonly report: BillingReportService,
    @Inject(VideoService) private readonly video: VideoService,
  ) {}

  async overview(now = new Date()): Promise<AdminOverview> {
    const since = daysAgo(30, now);
    const paidSince = {
      status: OrderStatus.PAID,
      paidAt: { gte: since },
    } as const;
    const [
      students,
      newStudents,
      activeEnrollments,
      purchases,
      revenue,
      pendingOrders,
      refundedWithAccess,
      callbacks,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: Role.STUDENT } }),
      this.prisma.user.count({
        where: { role: Role.STUDENT, createdAt: { gte: since } },
      }),
      this.prisma.enrollment.count({ where: { revokedAt: null } }),
      this.prisma.order.count({ where: paidSince }),
      this.prisma.order.aggregate({
        where: paidSince,
        _sum: { amountMinor: true },
      }),
      this.prisma.order.count({
        where: { status: OrderStatus.PENDING, expiresAt: { gt: now } },
      }),
      this.prisma.order.count({
        where: {
          status: OrderStatus.REFUNDED,
          enrollments: { some: { revokedAt: null } },
        },
      }),
      this.report.last24Hours(now),
    ]);
    return {
      students: { total: students, newLast30d: newStudents },
      enrollments: {
        active: activeEnrollments,
        purchasedLast30d: purchases,
      },
      revenueLast30dMinor: toMinorTotal(revenue._sum.amountMinor),
      pendingOrders,
      refundedWithAccess,
      // A callback that failed validation, or that matched no order.
      failedCallbacksLast24h:
        callbacks.callbacksWithMismatches +
        callbacks.callbacksWithoutMatchingOrder,
      video: this.video.summary(),
      payments: this.billing.availability(),
    };
  }
}
