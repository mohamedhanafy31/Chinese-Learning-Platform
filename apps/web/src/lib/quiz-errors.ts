import type { ApiResult } from '@/lib/api-client';
import { failureKey } from '@/lib/admin-client';
import type { AdminErrorKey } from '@/lib/admin-errors';

export type QuizErrorKey =
  AdminErrorKey | 'hasAttempts' | 'invalidOptions' | 'invalidImage';

async function readReason(response: Response | undefined): Promise<string> {
  if (!response) return '';
  try {
    const body: unknown = await response.clone().json();
    if (typeof body === 'object' && body !== null && 'reason' in body) {
      const { reason } = body as { reason: unknown };
      return typeof reason === 'string' ? reason : '';
    }
  } catch {
    // not JSON
  }
  return '';
}

/** Like `failureKey`, plus the quiz API's `reason` codes (409 and 422). */
export async function quizFailureKey(
  result: Extract<ApiResult<unknown>, { ok: false }>,
): Promise<QuizErrorKey | 'unauthenticated'> {
  if (result.kind !== 'unauthenticated') {
    const reason = await readReason(result.response);
    if (result.status === 409 && reason === 'has-attempts')
      return 'hasAttempts';
    if (result.status === 422 && reason === 'invalid-options') {
      return 'invalidOptions';
    }
    if (result.status === 422 && reason === 'invalid-image') {
      return 'invalidImage';
    }
  }
  return failureKey(result);
}
