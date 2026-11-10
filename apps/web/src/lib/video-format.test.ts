import { describe, expect, it } from 'vitest';

import { formatDuration, formatFileSize, formatPercent } from './video-format';

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(0, 'en')).toBe('0:00');
    expect(formatDuration(5, 'en')).toBe('0:05');
    expect(formatDuration(65, 'en')).toBe('1:05');
    expect(formatDuration(599.6, 'en')).toBe('10:00');
  });

  it('adds hours from an hour up', () => {
    expect(formatDuration(3600, 'en')).toBe('1:00:00');
    expect(formatDuration(3725, 'zh')).toBe('1:02:05');
    expect(formatDuration(36_000, 'en')).toBe('10:00:00');
  });

  it('uses Eastern Arabic digits in Arabic', () => {
    expect(formatDuration(65, 'ar')).toBe('١:٠٥');
    expect(formatDuration(3725, 'ar')).toBe('١:٠٢:٠٥');
    expect(formatDuration(65, 'ar')).not.toMatch(/[0-9]/);
  });

  it('treats invalid input as zero', () => {
    expect(formatDuration(Number.NaN, 'en')).toBe('0:00');
    expect(formatDuration(-4, 'en')).toBe('0:00');
  });
});

describe('formatFileSize', () => {
  it('picks a unit and keeps one decimal at most', () => {
    expect(formatFileSize(512, 'en')).toMatch(/512\s?byte/);
    expect(formatFileSize(2048, 'en')).toMatch(/2\s?kB/);
    expect(formatFileSize(5.5 * 1024 ** 2, 'en')).toMatch(/5\.5\s?MB/);
    expect(formatFileSize(2 * 1024 ** 3, 'en')).toMatch(/2\s?GB/);
  });

  it('uses Eastern Arabic digits in Arabic', () => {
    const text = formatFileSize(5.5 * 1024 ** 2, 'ar');
    expect(text).toMatch(/[٠-٩]/);
    expect(text).not.toMatch(/[0-9]/);
  });

  it('treats invalid input as zero bytes', () => {
    expect(formatFileSize(-1, 'en')).toMatch(/^0/);
    expect(formatFileSize(Number.NaN, 'en')).toMatch(/^0/);
  });
});

describe('formatPercent', () => {
  it('rounds and clamps', () => {
    expect(formatPercent(0.424, 'en')).toBe('42%');
    expect(formatPercent(1.4, 'en')).toBe('100%');
    expect(formatPercent(-1, 'en')).toBe('0%');
  });

  it('uses Eastern Arabic digits in Arabic', () => {
    expect(formatPercent(0.5, 'ar')).toMatch(/^٥٠/);
    expect(formatPercent(0.5, 'ar')).not.toMatch(/[0-9]/);
  });
});
