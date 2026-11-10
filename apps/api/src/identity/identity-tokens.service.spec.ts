import type { ConfigService } from '@nestjs/config';

import { IdentityTokensService } from './identity-tokens.service';
import type { Environment } from '../config/environment';

function configWith(refreshSecret: string): ConfigService<Environment, true> {
  return {
    get: (key: keyof Environment) => {
      if (key === 'JWT_ACCESS_SECRET') {
        return 'unit-test-access-secret-at-least-thirty-two-characters';
      }
      if (key === 'JWT_REFRESH_SECRET') {
        return refreshSecret;
      }
      throw new Error(`Unexpected configuration key: ${key}`);
    },
  } as ConfigService<Environment, true>;
}

describe('IdentityTokensService refresh hashing', () => {
  it('uses a deterministic HMAC hash without retaining the token', () => {
    const service = new IdentityTokensService(
      configWith('unit-test-refresh-secret-at-least-thirty-two-characters'),
    );
    const token = service.generateOpaqueToken();
    const tokenHash = service.hashRefreshToken(token);

    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(tokenHash).toMatch(/^[a-f\d]{64}$/);
    expect(service.hashRefreshToken(token)).toBe(tokenHash);
    expect(tokenHash).not.toContain(token);
  });

  it('changes when the configured pepper changes', () => {
    const first = new IdentityTokensService(configWith('a'.repeat(32)));
    const second = new IdentityTokensService(configWith('b'.repeat(32)));

    expect(first.hashRefreshToken('same-token')).not.toBe(
      second.hashRefreshToken('same-token'),
    );
  });
});
