import { describe, expect, it } from '@jest/globals';

import {
  BUNNY_ENV_KEYS,
  computeProviderReadiness,
  isPartiallyConfigured,
} from './provider-readiness';
import { sanitizeOriginalName } from './video.service';

const all = Object.fromEntries(BUNNY_ENV_KEYS.map((key) => [key, 'value']));

describe('computeProviderReadiness', () => {
  it('reports every key missing when nothing is set', () => {
    const readiness = computeProviderReadiness({});
    expect(readiness).toEqual({
      bunny: { configured: false, missing: [...BUNNY_ENV_KEYS] },
      active: 'LOCAL',
    });
    expect(isPartiallyConfigured(readiness)).toBe(false);
  });

  it('lists only the keys that are absent when partly configured', () => {
    const readiness = computeProviderReadiness({
      BUNNY_LIBRARY_ID: '123',
      BUNNY_API_KEY: 'secret',
    });
    expect(readiness.bunny.configured).toBe(false);
    expect(readiness.bunny.missing).toEqual([
      'BUNNY_TOKEN_KEY',
      'BUNNY_WEBHOOK_SECRET',
      'BUNNY_CDN_HOST',
    ]);
    expect(isPartiallyConfigured(readiness)).toBe(true);
  });

  it('is configured only when all five are present, and never echoes values', () => {
    const readiness = computeProviderReadiness(all);
    expect(readiness.bunny).toEqual({ configured: true, missing: [] });
    expect(JSON.stringify(readiness)).not.toContain('value');
    expect(isPartiallyConfigured(readiness)).toBe(false);
  });

  it('treats an empty string as missing', () => {
    expect(
      computeProviderReadiness({ ...all, BUNNY_API_KEY: '' }).bunny.missing,
    ).toEqual(['BUNNY_API_KEY']);
  });

  it('keeps LOCAL active until the Bunny provider exists', () => {
    expect(computeProviderReadiness(all).active).toBe('LOCAL');
  });
});

describe('sanitizeOriginalName', () => {
  it('keeps a plain name and strips paths and control characters', () => {
    expect(sanitizeOriginalName('lesson one.mp4')).toBe('lesson one.mp4');
    expect(sanitizeOriginalName('C:\\videos\\a.mp4')).toBe('a.mp4');
    expect(sanitizeOriginalName('../../etc/a\u0000b.mp4')).toBe('ab.mp4');
  });

  it('falls back and truncates to 255 characters', () => {
    expect(sanitizeOriginalName(undefined)).toBe('video');
    expect(sanitizeOriginalName('')).toBe('video');
    expect(Array.from(sanitizeOriginalName('x'.repeat(400))).length).toBe(255);
  });
});
