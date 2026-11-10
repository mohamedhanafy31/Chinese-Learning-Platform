import { describe, expect, it } from 'vitest';

import { authErrorKey } from '@/lib/auth-errors';

describe('authErrorKey', () => {
  it('maps public statuses without exposing API messages', () => {
    expect(authErrorKey(401, 'login')).toBe('badCredentials');
    expect(authErrorKey(409, 'register')).toBe('duplicateEmail');
    expect(authErrorKey(429, 'login')).toBe('rateLimited');
    expect(authErrorKey(400, 'reset')).toBe('invalidReset');
    expect(authErrorKey(500, 'generic')).toBe('retry');
    expect(authErrorKey(0, 'generic')).toBe('retry');
  });
});
