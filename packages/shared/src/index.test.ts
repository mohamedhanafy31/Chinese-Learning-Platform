import { describe, expect, it } from 'vitest';

import {
  createLessonRequestSchema,
  createLevelRequestSchema,
  localizedTextSchema,
  phoneSchema,
  registerRequestSchema,
} from './index';

describe('localizedTextSchema', () => {
  it('accepts English with optional Arabic and Chinese translations', () => {
    expect(
      localizedTextSchema.parse({ en: 'Lesson', ar: 'درس', zh: '课程' }),
    ).toEqual({ en: 'Lesson', ar: 'درس', zh: '课程' });
    expect(localizedTextSchema.parse({ en: 'Lesson' })).toEqual({
      en: 'Lesson',
    });
  });

  it('rejects values without an English translation', () => {
    expect(() => localizedTextSchema.parse({ ar: 'درس' })).toThrow();
  });
});

describe('identity contracts', () => {
  it('normalises valid international phone input', () => {
    expect(phoneSchema.parse('+20 100-123-4567')).toBe('+201001234567');
    expect(phoneSchema.parse('0020 (100) 123-4567')).toBe('+201001234567');
  });

  it('normalises Egyptian local mobiles and Arabic digits', () => {
    expect(phoneSchema.parse('0100 123 4567')).toBe('+201001234567');
    expect(phoneSchema.parse('٠١١٢-٣٤٥-٦٧٨٩')).toBe('+201123456789');
    expect(phoneSchema.parse('۰۱۵۵ ۱۲۳ ۴۵۶۷')).toBe('+201551234567');
  });

  it('rejects invalid Egyptian and non-E.164 values', () => {
    expect(() => phoneSchema.parse('0130 123 4567')).toThrow();
    expect(() => phoneSchema.parse('0100')).toThrow();
  });

  it('normalises registration transport fields', () => {
    expect(
      registerRequestSchema.parse({
        email: '  STUDENT@Example.com ',
        password: 'password123',
        name: ' Student ',
        phone: '+20 100-123-4567',
      }),
    ).toEqual({
      email: 'student@example.com',
      password: 'password123',
      name: 'Student',
      phone: '+201001234567',
    });
  });
});

describe('localizedTextSchema trimming', () => {
  it('trims strings and rejects an empty English value', () => {
    expect(
      localizedTextSchema.parse({ en: '  Hello ', ar: ' مرحبا ' }),
    ).toEqual({ en: 'Hello', ar: 'مرحبا' });
    expect(() => localizedTextSchema.parse({ en: '   ' })).toThrow();
    expect(() => localizedTextSchema.parse({ en: 'Hi', zh: '' })).toThrow();
  });
});

describe('catalog request schemas', () => {
  const level = {
    slug: 'level-1',
    hanzi: '入门',
    title: { en: 'First steps' },
    summary: { en: 'Pinyin' },
  };

  it('applies defaults for optional level fields', () => {
    expect(createLevelRequestSchema.parse(level)).toEqual({
      ...level,
      topics: [],
      priceMinor: null,
    });
  });

  it.each([
    'A',
    'a',
    'Level-1',
    'level_1',
    '-level',
    'level-',
    'a--b',
    'x'.repeat(65),
  ])('rejects slug %s', (slug) => {
    expect(() => createLevelRequestSchema.parse({ ...level, slug })).toThrow();
  });

  it.each(['ab', 'level-1', 'a1-b2-c3', 'x'.repeat(64)])(
    'accepts slug %s',
    (slug) => {
      expect(createLevelRequestSchema.parse({ ...level, slug }).slug).toBe(
        slug,
      );
    },
  );

  it('rejects negative, fractional and oversized prices', () => {
    for (const priceMinor of [-1, 10.5, 10_000_001]) {
      expect(() =>
        createLevelRequestSchema.parse({ ...level, priceMinor }),
      ).toThrow();
    }
    expect(
      createLevelRequestSchema.parse({ ...level, priceMinor: 10_000_000 })
        .priceMinor,
    ).toBe(10_000_000);
  });

  it('limits topics to twelve and hanzi to eight characters', () => {
    const topic = { en: 'Topic' };
    expect(() =>
      createLevelRequestSchema.parse({
        ...level,
        topics: Array.from({ length: 13 }, () => topic),
      }),
    ).toThrow();
    expect(() =>
      createLevelRequestSchema.parse({ ...level, hanzi: '一二三四五六七八九' }),
    ).toThrow();
    expect(() =>
      createLevelRequestSchema.parse({ ...level, hanzi: '' }),
    ).toThrow();
  });

  it('defaults lesson description, hanzi and preview flag', () => {
    expect(createLessonRequestSchema.parse({ title: { en: 'Tones' } })).toEqual(
      {
        title: { en: 'Tones' },
        description: null,
        hanzi: null,
        isFreePreview: false,
      },
    );
  });
});
