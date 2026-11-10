import 'server-only';

import { connection } from 'next/server';

import {
  publicLevelDetailSchema,
  publicLevelsResponseSchema,
  type PublicLevel,
  type PublicLevelDetail,
} from '@app/shared';

/**
 * Public catalog reads for server components.
 *
 * Caching: every call goes through the Next data cache with a 60 second
 * lifetime (`next.revalidate`), matching the API's own `max-age=60`. Failed
 * responses are never cached. `connection()` keeps the calling route out of
 * build-time prerendering, so `next build` never needs a running API and a
 * page never freezes an "API was down" state into static HTML.
 */
export const CATALOG_REVALIDATE_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 4000;

export type CatalogResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'not-found' }
  | { status: 'unavailable' };

async function fetchCatalog(path: string): Promise<Response | null> {
  await connection();
  const baseUrl = (
    process.env.INTERNAL_API_URL ?? 'http://localhost:4000'
  ).replace(/\/$/, '');
  try {
    return await fetch(`${baseUrl}${path}`, {
      next: { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ['catalog'] },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

export async function getPublicLevels(): Promise<
  CatalogResult<PublicLevel[]>
> {
  const response = await fetchCatalog('/api/v1/catalog/levels');
  if (!response?.ok) return { status: 'unavailable' };
  const parsed = publicLevelsResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success
    ? { status: 'ok', data: parsed.data.levels }
    : { status: 'unavailable' };
}

export async function getPublicLevel(
  slug: string,
): Promise<CatalogResult<PublicLevelDetail>> {
  const response = await fetchCatalog(
    `/api/v1/catalog/levels/${encodeURIComponent(slug)}`,
  );
  if (!response) return { status: 'unavailable' };
  if (response.status === 404) return { status: 'not-found' };
  if (!response.ok) return { status: 'unavailable' };
  const parsed = publicLevelDetailSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success
    ? { status: 'ok', data: parsed.data }
    : { status: 'unavailable' };
}
