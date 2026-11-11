import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EnrollmentSource } from '@app/shared';

import { isLevelReadableByEnrollees } from './content-access';
import type { Enrollment, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EnrollmentService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Idempotent. Creates the enrollment, reactivates a revoked one, or returns
   * the active one untouched. The level must be published or archived.
   */
  async grant(
    userId: string,
    levelId: string,
    source: EnrollmentSource,
    actorId?: string,
  ): Promise<Enrollment> {
    return this.prisma.$transaction(async (tx) => {
      return this.grantInTransaction(tx, userId, levelId, source, actorId);
    });
  }

  /** Used when enrollment must commit atomically with another bounded module. */
  async grantInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    levelId: string,
    source: EnrollmentSource,
    actorId?: string,
    orderId?: string,
  ): Promise<Enrollment> {
    const { enrollment } = await this.grantWithOutcome(
      tx,
      userId,
      levelId,
      source,
      actorId,
      orderId,
    );
    return enrollment;
  }

  /** Like `grantInTransaction`, and says what happened (for the audit log). */
  async grantWithOutcome(
    tx: Prisma.TransactionClient,
    userId: string,
    levelId: string,
    source: EnrollmentSource,
    actorId?: string,
    orderId?: string,
  ): Promise<{
    enrollment: Enrollment;
    outcome: 'created' | 'reactivated' | 'unchanged';
  }> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`enrollment:${userId}:${levelId}`}))`;
    const level = await tx.level.findUnique({ where: { id: levelId } });
    if (!level) throw new NotFoundException('Level not found');
    if (!isLevelReadableByEnrollees(level)) {
      throw new ConflictException(
        'A level that is not published cannot be granted',
      );
    }
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Student not found');

    const existing = await tx.enrollment.findUnique({
      where: { userId_levelId: { userId, levelId } },
    });
    if (existing && existing.revokedAt === null) {
      return { enrollment: existing, outcome: 'unchanged' };
    }
    if (existing) {
      const enrollment = await tx.enrollment.update({
        where: { id: existing.id },
        data: {
          source,
          grantedById: actorId ?? null,
          orderId: orderId ?? null,
          revokedAt: null,
          revokedById: null,
          revokeReason: null,
        },
      });
      return { enrollment, outcome: 'reactivated' };
    }
    const enrollment = await tx.enrollment.create({
      data: {
        userId,
        levelId,
        source,
        grantedById: actorId ?? null,
        orderId: orderId ?? null,
      },
    });
    return { enrollment, outcome: 'created' };
  }

  /** Idempotent. Revoking a missing or already revoked enrollment is a no-op. */
  async revoke(
    userId: string,
    levelId: string,
    actorId: string,
    reason?: string,
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.revokeInTransaction(tx, userId, levelId, actorId, reason),
    );
  }

  /** Returns whether an active enrollment was actually revoked. */
  async revokeInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    levelId: string,
    actorId: string,
    reason?: string,
  ): Promise<boolean> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`enrollment:${userId}:${levelId}`}))`;
    const level = await tx.level.findUnique({
      where: { id: levelId },
      select: { id: true },
    });
    if (!level) throw new NotFoundException('Level not found');
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Student not found');
    const { count } = await tx.enrollment.updateMany({
      where: { userId, levelId, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedById: actorId,
        revokeReason: reason ?? null,
      },
    });
    return count > 0;
  }

  /** The enrollment if it exists and has not been revoked. */
  async activeEnrollment(
    userId: string,
    levelId: string,
  ): Promise<Enrollment | null> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_levelId: { userId, levelId } },
    });
    return enrollment && enrollment.revokedAt === null ? enrollment : null;
  }
}
