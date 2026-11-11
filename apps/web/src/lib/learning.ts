import 'server-only';

import { cache } from 'react';

import {
  levelAccessResponseSchema,
  myLevelDetailSchema,
  myLevelsResponseSchema,
  playbackDeniedSchema,
  playbackNoVideoSchema,
  playbackResponseSchema,
  type LevelAccessResponse,
  type MyLevel,
  type MyLevelDetail,
  type PlaybackNoVideo,
  type PlaybackResponse,
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

export type PlaybackResult =
  | { status: 'ok'; data: PlaybackResponse }
  | { status: 'no-video'; data: PlaybackNoVideo }
  | { status: 'login-required' }
  | { status: 'not-enrolled'; levelSlug: string | null }
  | {
      status: 'sequence-locked';
      levelSlug: string | null;
      requiredLessonId: string | null;
    }
  | { status: 'not-found' }
  | { status: 'error' };

/**
 * One lesson's playback descriptor for the current viewer, or the reason it is
 * not available. Per request with the viewer's cookies, never cached; wrapped
 * in `cache` so `generateMetadata` and the page share a single API call.
 */
export const getPlayback = cache(
  async (lessonId: string): Promise<PlaybackResult> => {
    const response = await getJson(
      `/api/v1/lessons/${encodeURIComponent(lessonId)}/playback`,
    );
    if (!response) return { status: 'error' };
    const body: unknown = await response.json().catch(() => null);

    if (response.ok) {
      const parsed = playbackResponseSchema.safeParse(body);
      return parsed.success
        ? { status: 'ok', data: parsed.data }
        : { status: 'error' };
    }
    if (response.status === 401) return { status: 'login-required' };
    if (response.status === 403) {
      const parsed = playbackDeniedSchema.safeParse(body);
      const levelSlug = parsed.success ? (parsed.data.levelSlug ?? null) : null;
      // The previous lesson is not finished yet: a different gate from not
      // owning the level, so the page can point at the lesson to finish.
      if (parsed.success && parsed.data.reason === 'sequence-locked') {
        return {
          status: 'sequence-locked',
          levelSlug,
          requiredLessonId: parsed.data.requiredLessonId ?? null,
        };
      }
      return { status: 'not-enrolled', levelSlug };
    }
    if (response.status === 404) {
      const parsed = playbackNoVideoSchema.safeParse(body);
      return parsed.success
        ? { status: 'no-video', data: parsed.data }
        : { status: 'not-found' };
    }
    // A malformed id is a 400: there is no such lesson.
    if (response.status === 400) return { status: 'not-found' };
    return { status: 'error' };
  },
);
