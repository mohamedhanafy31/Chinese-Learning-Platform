import type { ApiResult } from '@/lib/api-client';
import {
  adminErrorKey,
  readApiMessage,
  type AdminErrorKey,
} from '@/lib/admin-errors';

/** Turns a failed `apiFetch` into a localized-error key (or a sign-in cue). */
export async function failureKey(
  result: Extract<ApiResult<unknown>, { ok: false }>,
): Promise<AdminErrorKey | 'unauthenticated'> {
  if (result.kind === 'unauthenticated') return 'unauthenticated';
  return adminErrorKey(result.status, await readApiMessage(result.response));
}
