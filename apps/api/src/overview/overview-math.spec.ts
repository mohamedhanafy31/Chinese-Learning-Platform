import { daysAgo, toMinorTotal } from './overview-math';

describe('toMinorTotal', () => {
  it('passes integer piaster totals through and treats no orders as zero', () => {
    expect(toMinorTotal(150_000)).toBe(150_000);
    expect(toMinorTotal(0)).toBe(0);
    expect(toMinorTotal(null)).toBe(0);
    expect(toMinorTotal(undefined)).toBe(0);
  });

  it('refuses fractional, negative and unsafe totals', () => {
    expect(() => toMinorTotal(10.5)).toThrow(RangeError);
    expect(() => toMinorTotal(-1)).toThrow(RangeError);
    expect(() => toMinorTotal(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
    expect(() => toMinorTotal(Number.NaN)).toThrow(RangeError);
  });
});

describe('daysAgo', () => {
  it('steps back whole days', () => {
    expect(daysAgo(30, new Date('2026-02-01T12:00:00Z')).toISOString()).toBe(
      '2026-01-02T12:00:00.000Z',
    );
  });
});
