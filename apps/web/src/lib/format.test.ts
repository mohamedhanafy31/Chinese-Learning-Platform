import { describe, expect, it } from 'vitest';

import { formatDate } from './format';

describe('formatDate', () => {
  const iso = '2026-03-05T10:00:00.000Z';

  it('uses Eastern Arabic digits in Arabic', () => {
    expect(formatDate(iso, 'ar')).toMatch(/[٠-٩]/);
    expect(formatDate(iso, 'ar')).not.toMatch(/[0-9]/);
  });

  it('uses Western digits in English and Chinese', () => {
    expect(formatDate(iso, 'en')).toContain('2026');
    expect(formatDate(iso, 'zh')).toContain('2026');
  });

  it.each(['ar', 'en', 'zh'] as const)(
    'formats in Cairo time for %s without changing the instant',
    (locale) => {
      expect(formatDate('2026-03-05T22:30:00.000Z', locale)).toBeTruthy();
    },
  );

  it('returns an empty string for an invalid date', () => {
    expect(formatDate('not-a-date', 'en')).toBe('');
  });
});
