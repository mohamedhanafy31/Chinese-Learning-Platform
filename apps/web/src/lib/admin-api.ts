import 'server-only';

import { notFound } from 'next/navigation';
import {
  adminAuditResponseSchema,
  adminOverviewSchema,
  adminLessonSchema,
  adminQuizDetailSchema,
  adminQuizzesResponseSchema,
  adminLevelDetailSchema,
  adminLevelsResponseSchema,
  adminStudentDetailSchema,
  adminStudentsResponseSchema,
  videoDiagnosticsSchema,
  type AdminAuditResponse,
  type AdminOverview,
  type AdminLesson,
  type AdminLevel,
  type AdminLevelDetail,
  type AdminQuizDetail,
  type AdminQuizSummary,
  type AdminStudentDetail,
  type AdminStudentsResponse,
  type AuditEntry,
  type VideoDiagnostics,
  type z,
} from '@app/shared';

import { apiServerFetch } from '@/lib/api-server';

async function adminGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await apiServerFetch(path);
  if (response.status === 404) notFound();
  if (!response.ok) {
    throw new Error(`Admin request ${path} failed with ${response.status}`);
  }
  return schema.parse(await response.json());
}

export async function getAdminLevels(): Promise<AdminLevel[]> {
  const { levels } = await adminGet(
    '/api/v1/admin/levels',
    adminLevelsResponseSchema,
  );
  return levels;
}

export function getAdminLevel(id: string): Promise<AdminLevelDetail> {
  return adminGet(`/api/v1/admin/levels/${id}`, adminLevelDetailSchema);
}

export function getAdminLesson(id: string): Promise<AdminLesson> {
  return adminGet(`/api/v1/admin/lessons/${id}`, adminLessonSchema);
}

export function getAdminStudents(params: {
  query: string;
  page: number;
}): Promise<AdminStudentsResponse> {
  const search = new URLSearchParams();
  if (params.query) search.set('query', params.query);
  search.set('page', String(params.page));
  return adminGet(
    `/api/v1/admin/students?${search}`,
    adminStudentsResponseSchema,
  );
}

export function getAdminStudent(id: string): Promise<AdminStudentDetail> {
  return adminGet(`/api/v1/admin/students/${id}`, adminStudentDetailSchema);
}

/** Provider readiness for the video panel; null when it cannot be read. */
export async function getVideoDiagnostics(): Promise<VideoDiagnostics | null> {
  try {
    return await adminGet(
      '/api/v1/admin/diagnostics/video',
      videoDiagnosticsSchema,
    );
  } catch {
    return null;
  }
}

export async function getAdminQuizzes(
  lessonId: string,
): Promise<AdminQuizSummary[]> {
  const { quizzes } = await adminGet(
    `/api/v1/admin/lessons/${lessonId}/quizzes`,
    adminQuizzesResponseSchema,
  );
  return quizzes;
}

export function getAdminQuiz(id: string): Promise<AdminQuizDetail> {
  return adminGet(`/api/v1/admin/quizzes/${id}`, adminQuizDetailSchema);
}

/** The overview numbers; null when they cannot be read. */
export async function getAdminOverview(): Promise<AdminOverview | null> {
  try {
    return await adminGet('/api/v1/admin/overview', adminOverviewSchema);
  } catch {
    return null;
  }
}

export function getAdminAudit(params: {
  entity?: string;
  entityId?: string;
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize?: number;
}): Promise<AdminAuditResponse> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  return adminGet(`/api/v1/admin/audit?${search}`, adminAuditResponseSchema);
}

/** The newest entries about one entity; null when they cannot be read. */
export async function getRecentAudit(
  entity: string,
  entityId: string,
): Promise<AuditEntry[] | null> {
  try {
    const { entries } = await getAdminAudit({
      entity,
      entityId,
      page: 1,
      pageSize: 10,
    });
    return entries;
  } catch {
    return null;
  }
}
