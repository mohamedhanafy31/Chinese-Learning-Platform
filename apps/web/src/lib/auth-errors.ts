export type AuthErrorKey =
  | 'badCredentials'
  | 'duplicateEmail'
  | 'invalidReset'
  | 'rateLimited'
  | 'retry';

export function authErrorKey(
  status: number,
  context: 'login' | 'register' | 'reset' | 'generic',
): AuthErrorKey {
  if (status === 429) return 'rateLimited';
  if (status === 409 && context === 'register') return 'duplicateEmail';
  if (status === 401 && context === 'login') return 'badCredentials';
  if (status === 400 && context === 'reset') return 'invalidReset';
  return 'retry';
}
