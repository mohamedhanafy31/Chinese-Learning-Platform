import { describe, expect, it } from 'vitest';

import { safeNext } from '@/lib/safe-next';

describe('safeNext', () => {
  const fallback = '/ar/dashboard';

  it('accepts locale-prefixed same-site paths', () => {
    expect(safeNext('/ar/dashboard', fallback)).toBe('/ar/dashboard');
    expect(safeNext('/en/levels/one?tab=lessons', fallback)).toBe(
      '/en/levels/one?tab=lessons',
    );
  });

  it.each([
    '//evil.com',
    '/\\evil',
    'https://evil.example/x',
    '/fr/x',
    '/ar/../x',
    '/ar/%2e%2e/x',
    '/ar//evil.example',
    'javascript:alert(1)',
  ])('rejects unsafe redirect %s', (value) => {
    expect(safeNext(value, fallback)).toBe(fallback);
  });
});
