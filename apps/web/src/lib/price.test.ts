import { describe, expect, it } from 'vitest';

import { formatEgp, parsePriceInput, priceToInput } from './price';

describe('parsePriceInput', () => {
  it.each([
    ['10', 1000],
    ['10.5', 1050],
    ['10.50', 1050],
    ['10.05', 1005],
    ['0', 0],
    ['0.00', 0],
    ['0.99', 99],
    ['1500', 150_000],
    ['  25 ', 2500],
    ['007', 700],
    ['100000', 10_000_000],
  ])('parses %s as %i piasters', (input, minor) => {
    expect(parsePriceInput(input)).toEqual({ ok: true, minor });
  });

  it('treats empty input as not announced', () => {
    expect(parsePriceInput('')).toEqual({ ok: true, minor: null });
    expect(parsePriceInput('   ')).toEqual({ ok: true, minor: null });
  });

  it('accepts Arabic-Indic and Persian digits and the Arabic decimal mark', () => {
    expect(parsePriceInput('١٠')).toEqual({ ok: true, minor: 1000 });
    expect(parsePriceInput('١٠٫٥٠')).toEqual({ ok: true, minor: 1050 });
    expect(parsePriceInput('۲۵.۵')).toEqual({ ok: true, minor: 2550 });
  });

  it('rejects thousands separators and decimal commas instead of guessing', () => {
    for (const input of ['1,000', '1٬000', '10,5', '1,000.50']) {
      expect(parsePriceInput(input)).toEqual({
        ok: false,
        reason: 'separator',
      });
    }
  });

  it('rejects more than two decimals', () => {
    expect(parsePriceInput('10.555')).toEqual({
      ok: false,
      reason: 'decimals',
    });
    expect(parsePriceInput('0.001')).toEqual({ ok: false, reason: 'decimals' });
  });

  it.each(['-1', '+5', '1e3', '10 EGP', '.5', '10.', 'abc', '1 000', '--'])(
    'rejects malformed input %s',
    (input) => {
      expect(parsePriceInput(input).ok).toBe(false);
    },
  );

  it('rejects prices above the platform maximum', () => {
    expect(parsePriceInput('100000.01')).toEqual({
      ok: false,
      reason: 'too-large',
    });
    expect(parsePriceInput('99999999999999999')).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });
});

describe('priceToInput', () => {
  it('formats piasters for editing', () => {
    expect(priceToInput(null)).toBe('');
    expect(priceToInput(0)).toBe('0');
    expect(priceToInput(1000)).toBe('10');
    expect(priceToInput(1050)).toBe('10.50');
    expect(priceToInput(1005)).toBe('10.05');
    expect(priceToInput(99)).toBe('0.99');
  });

  it('round-trips through the parser', () => {
    for (const minor of [0, 1, 99, 100, 1050, 150_000, 10_000_000]) {
      expect(parsePriceInput(priceToInput(minor))).toEqual({ ok: true, minor });
    }
  });
});

describe('formatEgp', () => {
  it('formats whole pounds without decimals', () => {
    expect(formatEgp(150_000, 'en')).toMatch(/EGP\s?1,500$/);
  });

  it('keeps piasters exact', () => {
    expect(formatEgp(150_050, 'en')).toMatch(/EGP\s?1,500\.50$/);
    expect(formatEgp(1, 'en')).toMatch(/EGP\s?0\.01$/);
  });

  it('uses Eastern Arabic digits in Arabic', () => {
    expect(formatEgp(150_000, 'ar')).toContain('١');
    expect(formatEgp(150_000, 'ar')).not.toMatch(/[0-9]/);
  });

  it('uses locale-aware digits in English and Chinese', () => {
    expect(formatEgp(150_000, 'en')).toMatch(/1,500/);
    expect(formatEgp(150_000, 'zh')).toMatch(/1,500/);
  });
});
