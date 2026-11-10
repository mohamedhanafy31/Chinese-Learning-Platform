import 'server-only';

import { notFound } from 'next/navigation';
import {
  adminLessonSchema,
  adminLevelDetailSchema,
  adminLevelsResponseSchema,
  type AdminLesson,
  type AdminLevel,
  type AdminLevelDetail,
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
