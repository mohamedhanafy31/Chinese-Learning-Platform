import { describe, expect, it } from 'vitest';

import { loginPathForNext, safeNext, safePortalNext } from '@/lib/safe-next';

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

  it('keeps student and admin destinations inside their own portals', () => {
    expect(safePortalNext('/ar/admin/levels', 'ar', 'student')).toBe(
      '/ar/dashboard',
    );
    expect(safePortalNext('/ar/dashboard', 'ar', 'admin')).toBe('/ar/admin');
    expect(safePortalNext('/ar/admin/levels', 'ar', 'admin')).toBe(
      '/ar/admin/levels',
    );
  });

  it('selects the login portal from the protected destination', () => {
    expect(loginPathForNext('ar', '/ar/admin/levels')).toBe(
      '/ar/admin/login?next=%2Far%2Fadmin%2Flevels',
    );
    expect(loginPathForNext('ar', '/ar/dashboard')).toBe(
      '/ar/login?next=%2Far%2Fdashboard',
    );
  });
});
