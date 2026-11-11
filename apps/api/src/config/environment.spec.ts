import { describe, expect, it } from '@jest/globals';

import { validateEnvironment } from './environment';

const base = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
  APP_URL: 'http://localhost:3000',
  INTERNAL_API_URL: 'http://localhost:4000',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('Bunny environment', () => {
  it('defaults the bases, embed ttl and reconcile interval', () => {
    const env = validateEnvironment({ ...base, BUNNY_API_BASE: '' });
    expect(env.BUNNY_API_BASE).toBe('https://video.bunnycdn.com');
    expect(env.BUNNY_EMBED_BASE).toBe('https://iframe.mediadelivery.net');
    expect(env.BUNNY_EMBED_TTL_SEC).toBe(7200);
    expect(env.VIDEO_RECONCILE_INTERVAL_SEC).toBe(300);
    expect(env.BUNNY_LIBRARY_ID).toBeUndefined();
  });

  it('accepts a numeric library id, a bare host, and 0 to disable reconcile', () => {
    const env = validateEnvironment({
      ...base,
      BUNNY_LIBRARY_ID: '12345',
      BUNNY_CDN_HOST: 'vz-abc123.b-cdn.net',
      VIDEO_RECONCILE_INTERVAL_SEC: '0',
    });
    expect(env.BUNNY_LIBRARY_ID).toBe('12345');
    expect(env.BUNNY_CDN_HOST).toBe('vz-abc123.b-cdn.net');
    expect(env.VIDEO_RECONCILE_INTERVAL_SEC).toBe(0);
  });

  it.each([
    ['BUNNY_LIBRARY_ID', 'abc'],
    ['BUNNY_CDN_HOST', 'https://vz.b-cdn.net'],
    ['BUNNY_CDN_HOST', 'vz.b-cdn.net/path'],
    ['BUNNY_API_BASE', 'not a url'],
    ['VIDEO_RECONCILE_INTERVAL_SEC', '-1'],
  ])('rejects %s=%s', (key, value) => {
    expect(() => validateEnvironment({ ...base, [key]: value })).toThrow(
      /Invalid environment/,
    );
  });
});

describe('Paymob environment', () => {
  it('defaults provider bases and billing intervals', () => {
    const env = validateEnvironment({ ...base });
    expect(env.PAYMOB_API_BASE).toBe('https://accept.paymob.com');
    expect(env.PAYMOB_CHECKOUT_BASE).toBe(
      'https://accept.paymob.com/unifiedcheckout/',
    );
    expect(env.ORDER_TTL_MIN).toBe(60);
    expect(env.BILLING_EXPIRY_INTERVAL_SEC).toBe(300);
  });

  it('accepts positive comma-separated ids and a disabled expiry interval', () => {
    const env = validateEnvironment({
      ...base,
      PAYMOB_INTEGRATION_IDS: '42, 99',
      BILLING_EXPIRY_INTERVAL_SEC: '0',
    });
    expect(env.PAYMOB_INTEGRATION_IDS).toBe('42, 99');
    expect(env.BILLING_EXPIRY_INTERVAL_SEC).toBe(0);
  });

  it.each(['0', '-1', '42,', 'abc', '42, 0'])(
    'rejects integration ids %s',
    (value) => {
      expect(() =>
        validateEnvironment({ ...base, PAYMOB_INTEGRATION_IDS: value }),
      ).toThrow(/Invalid environment/);
    },
  );
});

describe('production environment', () => {
  const production = {
    ...base,
    NODE_ENV: 'production',
    APP_URL: 'https://school.example.com',
    JWT_ACCESS_SECRET: 'A'.repeat(48),
    JWT_REFRESH_SECRET: 'B'.repeat(48),
  };
  const bunny = {
    BUNNY_LIBRARY_ID: '123',
    BUNNY_API_KEY: 'bunny-api-key-value',
    BUNNY_TOKEN_KEY: 'bunny-token-key-value',
    BUNNY_WEBHOOK_SECRET: 'bunny-webhook-secret-value',
    BUNNY_CDN_HOST: 'vz-abc.b-cdn.net',
  };
  const paymob = {
    PAYMOB_SECRET_KEY: 'paymob-secret-key-value',
    PAYMOB_PUBLIC_KEY: 'paymob-public-key-value',
    PAYMOB_HMAC_SECRET: 'paymob-hmac-secret-value',
    PAYMOB_INTEGRATION_IDS: '42',
  };
  const smtp = {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'mailer',
    SMTP_PASSWORD: 'smtp-password-value',
    SMTP_FROM: 'noreply@example.com',
  };

  function messageFor(values: Record<string, unknown>): string {
    try {
      validateEnvironment(values);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error('Expected the environment to be rejected');
  }

  it('boots with strong distinct secrets and complete optional groups', () => {
    expect(() => validateEnvironment(production)).not.toThrow();
    expect(() =>
      validateEnvironment({ ...production, ...bunny, ...paymob, ...smtp }),
    ).not.toThrow();
  });

  it.each([
    [
      'a short access secret',
      { JWT_ACCESS_SECRET: 'short' },
      'JWT_ACCESS_SECRET',
    ],
    [
      'a short refresh secret',
      { JWT_REFRESH_SECRET: 'x'.repeat(31) },
      'JWT_REFRESH_SECRET',
    ],
    [
      'the access placeholder',
      { JWT_ACCESS_SECRET: 'replace-with-a-long-random-access-secret' },
      'JWT_ACCESS_SECRET',
    ],
    [
      'the refresh placeholder',
      {
        JWT_REFRESH_SECRET:
          'replace-with-a-different-long-random-refresh-secret',
      },
      'JWT_REFRESH_SECRET',
    ],
    [
      'identical access and refresh secrets',
      { JWT_REFRESH_SECRET: 'A'.repeat(48) },
      'JWT_REFRESH_SECRET',
    ],
    ['a missing APP_URL', { APP_URL: undefined }, 'APP_URL'],
    [
      'a plain-http APP_URL',
      { APP_URL: 'http://school.example.com' },
      'APP_URL',
    ],
    [
      'a plain-http API_PUBLIC_ORIGIN (the development value)',
      { API_PUBLIC_ORIGIN: 'http://localhost:4000' },
      'API_PUBLIC_ORIGIN',
    ],
    ['a missing DATABASE_URL', { DATABASE_URL: undefined }, 'DATABASE_URL'],
    [
      'a missing INTERNAL_API_URL',
      { INTERNAL_API_URL: undefined },
      'INTERNAL_API_URL',
    ],
    [
      'a partial Bunny group',
      { BUNNY_LIBRARY_ID: '1', BUNNY_API_KEY: 'bunny-api-key-value' },
      'BUNNY_TOKEN_KEY',
    ],
    [
      'a partial Paymob group',
      { PAYMOB_SECRET_KEY: 'paymob-secret-key-value' },
      'PAYMOB_HMAC_SECRET',
    ],
    ['a partial SMTP group', { SMTP_HOST: 'smtp.example.com' }, 'SMTP_'],
  ])('refuses to boot with %s', (_label, overrides, variable) => {
    const message = messageFor({ ...production, ...overrides });
    expect(message).toMatch(/Invalid environment/);
    expect(message).toContain(variable);
  });

  it('never prints secret values in refusal messages', () => {
    const secret = 'replace-with-super-secret-looking-value-1234';
    const message = messageFor({
      ...production,
      JWT_ACCESS_SECRET: secret,
      JWT_REFRESH_SECRET: secret,
      PAYMOB_SECRET_KEY: 'paymob-secret-must-not-leak',
    });
    expect(message).not.toContain(secret);
    expect(message).not.toContain('paymob-secret-must-not-leak');
  });

  it('keeps the relaxed development rules outside production', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: 'development',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'a'.repeat(32),
        BUNNY_LIBRARY_ID: '1',
      }),
    ).not.toThrow();
  });
});
