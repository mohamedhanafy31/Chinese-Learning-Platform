import {
  BadRequestException,
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
import { parseLocalizedText } from '../catalog/catalog.mapper';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const activeCount = {
  _count: { select: { enrollments: { where: { revokedAt: null } } } },
} as const;

function toAdminStudent(
  row: {
    id: string;
    name: string;
    email: string;
    phone: string;
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
            level: { select: { slug: true, hanzi: true, title: true } },
            grantedBy: { select: { name: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Student not found');
    const { enrollments, ...student } = row;
    return {
      ...toAdminStudent(student),
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
    await this.enrollments.grant(
      studentId,
      levelId,
      EnrollmentSource.ADMIN,
      actorId,
    );
    return this.get(studentId);
  }

  async revoke(
    studentId: string,
    levelId: string,
    actorId: string,
    reason?: string,
  ): Promise<void> {
    await this.enrollments.revoke(studentId, levelId, actorId, reason);
  }
}
