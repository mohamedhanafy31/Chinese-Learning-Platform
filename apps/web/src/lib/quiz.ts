import 'server-only';

import { cache } from 'react';

import {
  attemptDetailSchema,
  attemptsResponseSchema,
  learnerQuizSchema,
  learnerQuizzesResponseSchema,
  type AttemptDetail,
  type AttemptSummary,
  type LearnerQuiz,
  type LearnerQuizSummary,
} from '@app/shared';

import { apiServerFetch } from '@/lib/api-server';

async function get(path: string): Promise<Response | null> {
  try {
    return await apiServerFetch(path, { signal: AbortSignal.timeout(4000) });
  } catch {
    return null;
  }
}

/** Live quizzes of a lesson the viewer may open; empty on any failure. */
export async function getLessonQuizzes(
  lessonId: string,
): Promise<LearnerQuizSummary[]> {
  const response = await get(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/quizzes`,
  );
  if (!response?.ok) return [];
  const parsed = learnerQuizzesResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success ? parsed.data.quizzes : [];
}

export type QuizResult =
  | { status: 'ok'; quiz: LearnerQuiz }
  | { status: 'login-required' }
  | { status: 'not-enrolled' }
  | { status: 'not-found' }
  | { status: 'error' };

export const getQuiz = cache(async (id: string): Promise<QuizResult> => {
  const response = await get(`/api/v1/quizzes/${encodeURIComponent(id)}`);
  if (!response) return { status: 'error' };
  if (response.ok) {
    const parsed = learnerQuizSchema.safeParse(
      await response.json().catch(() => null),
    );
    return parsed.success
      ? { status: 'ok', quiz: parsed.data }
      : { status: 'error' };
  }
  if (response.status === 401) return { status: 'login-required' };
  if (response.status === 403) return { status: 'not-enrolled' };
  if (response.status === 404 || response.status === 400) {
    return { status: 'not-found' };
  }
  return { status: 'error' };
});

export async function getAttempts(quizId: string): Promise<AttemptSummary[]> {
  const response = await get(
    `/api/v1/quizzes/${encodeURIComponent(quizId)}/attempts`,
  );
  if (!response?.ok) return [];
  const parsed = attemptsResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success ? parsed.data.attempts : [];
}

export type AttemptResult =
  | { status: 'ok'; detail: AttemptDetail }
  | { status: 'login-required' }
  | { status: 'not-found' }
  | { status: 'error' };

export async function getAttempt(id: string): Promise<AttemptResult> {
  const response = await get(`/api/v1/attempts/${encodeURIComponent(id)}`);
  if (!response) return { status: 'error' };
  if (response.ok) {
    const parsed = attemptDetailSchema.safeParse(
      await response.json().catch(() => null),
    );
    return parsed.success
      ? { status: 'ok', detail: parsed.data }
      : { status: 'error' };
  }
  if (response.status === 401) return { status: 'login-required' };
  if (response.status === 404 || response.status === 400) {
    return { status: 'not-found' };
  }
  return { status: 'error' };
}
