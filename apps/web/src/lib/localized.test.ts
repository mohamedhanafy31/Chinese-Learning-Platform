import { describe, expect, it } from 'vitest';

import {
  fromLocalizedInput,
  isLocalizedInputBlank,
  pick,
  toLocalizedInput,
} from './localized';

describe('pick', () => {
  it('uses the locale text and falls back to English', () => {
    expect(pick({ en: 'Tones', ar: 'نغمات' }, 'ar')).toBe('نغمات');
    expect(pick({ en: 'Tones', ar: 'نغمات' }, 'zh')).toBe('Tones');
    expect(pick({ en: 'Tones' }, 'en')).toBe('Tones');
  });
});

describe('localized form helpers', () => {
  it('omits blank Arabic and Chinese and trims the rest', () => {
    expect(fromLocalizedInput({ ar: '  ', en: ' Tones ', zh: '' })).toEqual({
      en: 'Tones',
    });
    expect(fromLocalizedInput({ ar: 'نغمات', en: 'Tones', zh: ' 声调 ' })).toEqual(
      { ar: 'نغمات', en: 'Tones', zh: '声调' },
    );
  });

  it('keeps a blank English value so validation can report it', () => {
    expect(fromLocalizedInput({ ar: 'نغمات', en: ' ', zh: '' })).toEqual({
      ar: 'نغمات',
      en: '',
    });
  });

  it('round-trips API text into three inputs', () => {
    expect(toLocalizedInput({ en: 'Tones', zh: '声调' })).toEqual({
      ar: '',
      en: 'Tones',
      zh: '声调',
    });
    expect(toLocalizedInput(null)).toEqual({ ar: '', en: '', zh: '' });
  });

  it('detects fully blank rows', () => {
    expect(isLocalizedInputBlank({ ar: ' ', en: '', zh: '' })).toBe(true);
    expect(isLocalizedInputBlank({ ar: '', en: 'x', zh: '' })).toBe(false);
  });
});
