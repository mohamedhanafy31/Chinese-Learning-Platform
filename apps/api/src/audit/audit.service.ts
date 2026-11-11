import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminAuditQuery,
  AdminAuditResponse,
  AuditEntity,
  AuditEntry,
} from '@app/shared';

import { scrubAuditData } from './audit-diff';
import {
  labelKey,
  resolveEntityLabels,
  type LabelClient,
} from './audit-labels';
import { auditRange } from './audit-range';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** A Prisma client or the transaction client of an open transaction. */
export type AuditClient = PrismaService | Prisma.TransactionClient;

export interface AuditRecord {
  actorId: string;
  /** `<noun>.<verb>`, for example `level.publish`. */
  action: string;
  /** What the action is about: Level, Lesson, Quiz, Student or Image. */
  entity: string;
  entityId: string;
  /** Ids and non-secret changed fields only. */
  data?: Record<string, unknown>;
}

const actorSelect = { select: { id: true, name: true, email: true } } as const;

/**
 * The admin audit log. It is append-only: nothing here updates or deletes a
 * row, and no route does either.
 *
 * Call `record` with the transaction client from inside the transaction that
 * makes the change, so a rolled-back change leaves no audit row. Where a
 * change does not use a transaction, call it with the Prisma service right
 * after the change succeeded.
 *
 * Billing state changes (an order paid by webhook, a refund recorded) are not
 * audited: they have no admin actor, and the Order and PaymentTransaction rows
 * are their own record.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(client: AuditClient, entry: AuditRecord): Promise<void> {
    await client.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        data: scrubAuditData(entry.data ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async list(query: AdminAuditQuery): Promise<AdminAuditResponse> {
    const range = auditRange(query.from, query.to);
    const where: Prisma.AuditLogWhereInput = {
      entity: query.entity,
      entityId: query.entityId,
      actorId: query.actorId,
      action: query.action,
      createdAt: Object.keys(range).length > 0 ? range : undefined,
      actor: query.actor
        ? {
            OR: [
              { name: { contains: query.actor, mode: 'insensitive' } },
              { email: { contains: query.actor, mode: 'insensitive' } },
            ],
          }
        : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { actor: actorSelect },
      }),
    ]);
    return {
      entries: await this.toEntries(rows),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** The newest entries about one entity. */
  async recent(
    entity: AuditEntity,
    entityId: string,
    limit = 10,
  ): Promise<AuditEntry[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { entity, entityId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { actor: actorSelect },
    });
    return this.toEntries(rows);
  }

  private async toEntries(
    rows: Array<{
      id: string;
      createdAt: Date;
      action: string;
      entity: string;
      entityId: string;
      data: Prisma.JsonValue;
      actor: { id: string; name: string; email: string };
    }>,
  ): Promise<AuditEntry[]> {
    const labels = await resolveEntityLabels(
      this.prisma as unknown as LabelClient,
      rows,
    );
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      entityLabel: labels.get(labelKey(row.entity, row.entityId)) ?? null,
      actor: row.actor,
      data:
        typeof row.data === 'object' &&
        row.data !== null &&
        !Array.isArray(row.data)
          ? (row.data as Record<string, unknown>)
          : {},
    }));
  }
}
