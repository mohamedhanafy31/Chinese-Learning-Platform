import { describe, expect, it } from 'vitest';

import { internalApiUrl } from './internal-api-url';

describe('internalApiUrl', () => {
  it('returns the configured address without a trailing slash', () => {
    expect(
      internalApiUrl({
        NODE_ENV: 'production',
        INTERNAL_API_URL: 'http://api:4000/',
      }),
    ).toBe('http://api:4000');
  });

  it('refuses to guess in production', () => {
    expect(() => internalApiUrl({ NODE_ENV: 'production' })).toThrow(
      /INTERNAL_API_URL is required in production/,
    );
    expect(() =>
      internalApiUrl({ NODE_ENV: 'production', INTERNAL_API_URL: '  ' }),
    ).toThrow(/INTERNAL_API_URL/);
  });

  it('falls back to localhost in development, test and during the build', () => {
    expect(internalApiUrl({ NODE_ENV: 'development' })).toBe(
      'http://localhost:4000',
    );
    expect(internalApiUrl({ NODE_ENV: 'test' })).toBe('http://localhost:4000');
    expect(
      internalApiUrl({
        NODE_ENV: 'production',
        NEXT_PHASE: 'phase-production-build',
      }),
    ).toBe('http://localhost:4000');
  });
});
