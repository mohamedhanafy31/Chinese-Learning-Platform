import 'server-only';

import {
  levelAccessResponseSchema,
  myLevelDetailSchema,
  myLevelsResponseSchema,
  type LevelAccessResponse,
  type MyLevel,
  type MyLevelDetail,
} from '@app/shared';

import { apiServerFetch } from '@/lib/api-server';

const TIMEOUT_MS = 4000;

async function getJson(path: string): Promise<Response | null> {
  try {
    return await apiServerFetch(path, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

/**
 * What the current viewer may open in a level. Per request, with the viewer's
 * cookies, never cached. Any failure returns null so the caller can fall back
 * to the anonymous view instead of breaking the public page.
 */
export async function getLevelAccess(
  slug: string,
): Promise<LevelAccessResponse | null> {
  const response = await getJson(
    `/api/v1/catalog/levels/${encodeURIComponent(slug)}/access`,
  );
  if (!response?.ok) return null;
  const parsed = levelAccessResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success ? parsed.data : null;
}

/** An owned level (archived ones included), or null when not owned/signed out. */
export async function getMyLevel(slug: string): Promise<MyLevelDetail | null> {
  const response = await getJson(
    `/api/v1/me/levels/${encodeURIComponent(slug)}`,
  );
  if (!response?.ok) return null;
  const parsed = myLevelDetailSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success ? parsed.data : null;
}

export type MyLevelsResult =
  { status: 'ok'; levels: MyLevel[] } | { status: 'error' };

export async function getMyLevels(): Promise<MyLevelsResult> {
  const response = await getJson('/api/v1/me/levels');
  if (!response?.ok) return { status: 'error' };
  const parsed = myLevelsResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success
    ? { status: 'ok', levels: parsed.data.levels }
    : { status: 'error' };
}
