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
