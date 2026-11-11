import { auditRange, startOfCairoDay } from './audit-range';

describe('auditRange', () => {
  it('turns a bare date into the Cairo calendar day', () => {
    // Winter: Cairo is UTC+2.
    expect(startOfCairoDay(2026, 1, 15).toISOString()).toBe(
      '2026-01-14T22:00:00.000Z',
    );
    // Summer: Cairo is UTC+3.
    expect(startOfCairoDay(2026, 7, 15).toISOString()).toBe(
      '2026-07-14T21:00:00.000Z',
    );
  });

  it('makes `to` include the whole day', () => {
    const range = auditRange('2026-01-15', '2026-01-15');
    expect(range.gte?.toISOString()).toBe('2026-01-14T22:00:00.000Z');
    expect(range.lt?.toISOString()).toBe('2026-01-15T22:00:00.000Z');
  });

  it('rolls over month and year ends', () => {
    expect(auditRange(undefined, '2026-12-31').lt?.toISOString()).toBe(
      '2026-12-31T22:00:00.000Z',
    );
  });

  it('passes full timestamps through and ignores unparsable ones', () => {
    expect(
      auditRange('2026-01-01T10:00:00Z', undefined).gte?.toISOString(),
    ).toBe('2026-01-01T10:00:00.000Z');
    expect(
      auditRange(undefined, '2026-01-01T10:00:00Z').lte?.toISOString(),
    ).toBe('2026-01-01T10:00:00.000Z');
    expect(auditRange('2026-99-99T99', undefined)).toEqual({});
  });
});
