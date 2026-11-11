import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EnrollmentSource,
  Role,
  type AdminEnrollment,
  type AdminStudent,
  type AdminStudentDetail,
  type AdminStudentsQuery,
  type AdminStudentsResponse,
} from '@app/shared';

import { EnrollmentService } from './enrollment.service';
import { AuditService } from '../audit/audit.service';
import { mapOrder } from '../billing/order-mapper';
import { parseLocalizedText } from '../catalog/catalog.mapper';
import type { Prisma } from '../generated/prisma/client';
import { IdentityService } from '../identity/identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';

const RECENT_AUDIT_LIMIT = 10;

const activeCount = {
  _count: { select: { enrollments: { where: { revokedAt: null } } } },
} as const;

function toAdminStudent(
  row: {
    id: string;
    name: string;
    email: string;
    phone: string;
    isActive: boolean;
    createdAt: Date;
  } & { _count: { enrollments: number } },
): AdminStudent {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    createdAt: row.createdAt.toISOString(),
    activeEnrollments: row._count.enrollments,
    isActive: row.isActive,
  };
}

function searchFilter(query: string): Prisma.UserWhereInput {
  if (!query) return { role: Role.STUDENT };
  // Phones are stored compact (+2010...), so also try the query without
  // spaces, dashes and brackets.
  const compact = query.replace(/[\s\-()]/g, '');
  const terms = Array.from(new Set([query, compact].filter(Boolean)));
  return {
    role: Role.STUDENT,
    OR: terms.flatMap((term) => [
      { email: { contains: term, mode: 'insensitive' as const } },
      { name: { contains: term, mode: 'insensitive' as const } },
      { phone: { contains: term, mode: 'insensitive' as const } },
    ]),
  };
}

@Injectable()
export class AdminStudentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EnrollmentService) private readonly enrollments: EnrollmentService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(ProgressService) private readonly progress: ProgressService,
  ) {}

  async list(input: AdminStudentsQuery): Promise<AdminStudentsResponse> {
    const where = searchFilter(input.query);
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: activeCount,
      }),
    ]);
    return {
      students: rows.map(toAdminStudent),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async get(id: string): Promise<AdminStudentDetail> {
    const row = await this.prisma.user.findFirst({
      where: { id, role: Role.STUDENT },
      include: {
        ...activeCount,
        enrollments: {
          orderBy: { createdAt: 'desc' },
          include: {
            level: {
              select: {
                slug: true,
                hanzi: true,
                title: true,
                lessons: {
                  where: { isPublished: true, archivedAt: null },
                  select: { id: true },
                },
              },
            },
            grantedBy: { select: { name: true } },
          },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          include: { level: { select: { slug: true, title: true } } },
        },
      },
    });
    if (!row) throw new NotFoundException('Student not found');
    const { enrollments, orders, ...student } = row;
    const completed = await this.progress.completedLessonIds(
      id,
      enrollments
        .filter((enrollment) => enrollment.revokedAt === null)
        .flatMap((enrollment) => enrollment.level.lessons.map((l) => l.id)),
    );
    const recentAudit = await this.audit.recent(
      'Student',
      id,
      RECENT_AUDIT_LIMIT,
    );
    return {
      ...toAdminStudent(student),
      orders: orders.map(mapOrder),
      recentAudit,
      enrollments: enrollments.map((enrollment): AdminEnrollment => ({
        id: enrollment.id,
        levelId: enrollment.levelId,
        level: {
          slug: enrollment.level.slug,
          hanzi: enrollment.level.hanzi,
          title: parseLocalizedText(enrollment.level.title),
        },
        source: enrollment.source,
        grantedByName: enrollment.grantedBy?.name ?? null,
        createdAt: enrollment.createdAt.toISOString(),
        revokedAt: enrollment.revokedAt?.toISOString() ?? null,
        revokeReason: enrollment.revokeReason,
        progress:
          enrollment.revokedAt === null
            ? {
                completed: enrollment.level.lessons.filter((lesson) =>
                  completed.has(lesson.id),
                ).length,
                total: enrollment.level.lessons.length,
              }
            : null,
      })),
    };
  }

  async grant(
    studentId: string,
    levelId: string,
    actorId: string,
  ): Promise<AdminStudentDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('Student not found');
    if (user.role === Role.ADMIN) {
      throw new BadRequestException('Administrators cannot be enrolled');
    }
    await this.prisma.$transaction(async (tx) => {
      const { enrollment, outcome } = await this.enrollments.grantWithOutcome(
        tx,
        studentId,
        levelId,
        EnrollmentSource.ADMIN,
        actorId,
      );
      // Granting what is already active changes nothing, so records nothing.
      if (outcome === 'unchanged') return;
      await this.audit.record(tx, {
        actorId,
        action:
          outcome === 'reactivated'
            ? 'enrollment.reactivate'
            : 'enrollment.grant',
        entity: 'Student',
        entityId: studentId,
        data: { levelId, enrollmentId: enrollment.id },
      });
    });
    return this.get(studentId);
  }

  async revoke(
    studentId: string,
    levelId: string,
    actorId: string,
    reason?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const revoked = await this.enrollments.revokeInTransaction(
        tx,
        studentId,
        levelId,
        actorId,
        reason,
      );
      if (!revoked) return;
      await this.audit.record(tx, {
        actorId,
        action: 'enrollment.revoke',
        entity: 'Student',
        entityId: studentId,
        data: { levelId, reason: reason ?? null },
      });
    });
  }

  /**
   * Deactivates a student and signs them out everywhere: the account update,
   * the session revocation and the audit row commit together. An admin cannot
   * deactivate themselves.
   */
  async deactivate(
    studentId: string,
    actorId: string,
  ): Promise<AdminStudentDetail> {
    const student = await this.findStudentOrThrow(studentId, actorId);
    if (student.isActive) {
      await this.identity.deactivateUser(studentId, (tx) =>
        this.audit.record(tx, {
          actorId,
          action: 'student.deactivate',
          entity: 'Student',
          entityId: studentId,
        }),
      );
    }
    return this.get(studentId);
  }

  async reactivate(
    studentId: string,
    actorId: string,
  ): Promise<AdminStudentDetail> {
    const student = await this.findStudentOrThrow(studentId, actorId);
    if (!student.isActive) {
      await this.identity.reactivateUser(studentId, (tx) =>
        this.audit.record(tx, {
          actorId,
          action: 'student.reactivate',
          entity: 'Student',
          entityId: studentId,
        }),
      );
    }
    return this.get(studentId);
  }

  private async findStudentOrThrow(
    studentId: string,
    actorId: string,
  ): Promise<{ isActive: boolean }> {
    if (studentId === actorId) {
      throw new ConflictException(
        'You cannot change the status of your own account',
      );
    }
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, role: Role.STUDENT },
      select: { isActive: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }
}
