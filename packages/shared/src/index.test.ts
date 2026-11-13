import { describe, expect, it } from 'vitest';

import {
  adminStudentsQuerySchema,
  createLessonRequestSchema,
  createLevelRequestSchema,
  createQuizRequestSchema,
  learnerQuestionSchema,
  localizedTextSchema,
  phoneSchema,
  questionRequestSchema,
  registerRequestSchema,
  reportProgressRequestSchema,
  revokeEnrollmentRequestSchema,
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
    expect(() => phoneSchema.parse('+1 202-555-0100')).toThrow();
    expect(() => phoneSchema.parse('+20 2 2345 6789')).toThrow();
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
      coverImageId: null,
    });
  });

  it('accepts a uuid or null for image references and rejects other values', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(
      createLevelRequestSchema.parse({ ...level, coverImageId: id })
        .coverImageId,
    ).toBe(id);
    expect(() =>
      createLevelRequestSchema.parse({ ...level, coverImageId: 'nope' }),
    ).toThrow();
    expect(
      createLessonRequestSchema.parse({
        title: { en: 'Tones' },
        thumbnailId: null,
      }).thumbnailId,
    ).toBeNull();
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

  it('rejects zero, negative, fractional and oversized prices while allowing null', () => {
    for (const priceMinor of [0, -1, 10.5, 10_000_001]) {
      expect(() =>
        createLevelRequestSchema.parse({ ...level, priceMinor }),
      ).toThrow();
    }
    expect(
      createLevelRequestSchema.parse({ ...level, priceMinor: null }).priceMinor,
    ).toBeNull();
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
        thumbnailId: null,
      },
    );
  });
});

describe('learning contracts', () => {
  it('defaults and bounds the students query', () => {
    expect(adminStudentsQuerySchema.parse({})).toEqual({
      query: '',
      page: 1,
      pageSize: 20,
    });
    expect(
      adminStudentsQuerySchema.parse({
        query: '  Amal ',
        page: '3',
        pageSize: '50',
      }),
    ).toEqual({ query: 'Amal', page: 3, pageSize: 50 });
    expect(
      adminStudentsQuerySchema.parse({ page: '', pageSize: '' }),
    ).toMatchObject({
      page: 1,
      pageSize: 20,
    });
    expect(() => adminStudentsQuerySchema.parse({ pageSize: '51' })).toThrow();
    expect(() => adminStudentsQuerySchema.parse({ page: '0' })).toThrow();
    expect(() => adminStudentsQuerySchema.parse({ page: 'x' })).toThrow();
  });

  it('accepts an empty or missing revoke body and bounds the reason', () => {
    expect(revokeEnrollmentRequestSchema.parse(undefined)).toEqual({
      reason: undefined,
    });
    expect(revokeEnrollmentRequestSchema.parse({})).toEqual({
      reason: undefined,
    });
    expect(revokeEnrollmentRequestSchema.parse({ reason: '   ' })).toEqual({
      reason: undefined,
    });
    expect(revokeEnrollmentRequestSchema.parse({ reason: ' Refund ' })).toEqual(
      {
        reason: 'Refund',
      },
    );
    expect(() =>
      revokeEnrollmentRequestSchema.parse({ reason: 'x'.repeat(501) }),
    ).toThrow();
  });
});

describe('assessment contracts', () => {
  it('defaults question fields and keeps option counts for the domain rules', () => {
    const parsed = questionRequestSchema.parse({
      type: 'TRUE_FALSE',
      prompt: { en: 'Is 你好 hello?' },
    });
    expect(parsed).toMatchObject({
      hanzi: null,
      imageId: null,
      explanation: null,
      points: 1,
      options: [],
    });
  });

  it('bounds points, hanzi and passing score', () => {
    const base = { type: 'SINGLE', prompt: { en: 'Q' } };
    expect(() => questionRequestSchema.parse({ ...base, points: 0 })).toThrow();
    expect(() =>
      questionRequestSchema.parse({ ...base, points: 101 }),
    ).toThrow();
    expect(() =>
      questionRequestSchema.parse({ ...base, hanzi: '你'.repeat(201) }),
    ).toThrow();
    expect(
      questionRequestSchema.parse({ ...base, hanzi: '你'.repeat(200) }).hanzi,
    ).toHaveLength(200);
    expect(createQuizRequestSchema.parse({ title: { en: 'Q' } })).toMatchObject(
      { passingScore: 70, description: null },
    );
    expect(() =>
      createQuizRequestSchema.parse({ title: { en: 'Q' }, passingScore: 101 }),
    ).toThrow();
  });

  it('strips correctness and explanations from the learner quiz shape', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const parsed = learnerQuestionSchema.parse({
      id,
      type: 'SINGLE',
      prompt: { en: 'Q' },
      hanzi: null,
      image: null,
      points: 1,
      explanation: { en: 'secret' },
      options: [{ id, text: { en: 'A' }, isCorrect: true }],
    });
    expect(JSON.stringify(parsed)).not.toMatch(/isCorrect|explanation|secret/);
  });
});

describe('reportProgressRequestSchema', () => {
  it('accepts integer and one-decimal second ranges', () => {
    expect(
      reportProgressRequestSchema.parse({
        segments: [
          [0, 10],
          [12.5, 20.1],
        ],
        positionSec: 20,
        durationSec: 95,
      }).segments,
    ).toHaveLength(2);
  });

  it.each([
    { segments: [[0, 5.123]], positionSec: 5 },
    { segments: [[-1, 5]], positionSec: 5 },
    { segments: [[0, 5000000]], positionSec: 5 },
    { segments: Array.from({ length: 21 }, () => [0, 1]), positionSec: 1 },
    { segments: [[0, 1, 2]], positionSec: 1 },
    { segments: [], positionSec: -3 },
    { positionSec: 3 },
  ])('rejects %j', (body) => {
    expect(reportProgressRequestSchema.safeParse(body).success).toBe(false);
  });
});
