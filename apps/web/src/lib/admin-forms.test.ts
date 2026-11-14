import { describe, expect, it } from 'vitest';

import {
  changedLocalizedFields,
  clearFieldErrors,
  buildLessonPayload,
  buildLevelPayload,
  type LessonFormValues,
  type LevelFormValues,
} from './admin-forms';

describe('field error clearing', () => {
  it('clears only the changed localized field', () => {
    const errors = { 'title.en': 'required', 'title.ar': 'required' } as const;
    const fields = changedLocalizedFields(
      'title',
      { ar: '', en: '', zh: '' },
      { ar: '', en: 'Title', zh: '' },
    );
    expect(clearFieldErrors(errors, fields)).toEqual({
      'title.ar': 'required',
    });
  });
});

const blank = { ar: '', en: '', zh: '' };

const level = (overrides: Partial<LevelFormValues> = {}): LevelFormValues => ({
  slug: 'level-1',
  hanzi: '入门',
  title: { ar: 'البداية', en: 'First steps', zh: '' },
  summary: { ar: '', en: 'Pinyin and tones', zh: '' },
  topics: [],
  coverImageId: null,
  ...overrides,
});

describe('buildLevelPayload', () => {
  it('builds the API payload, omitting blank translations', () => {
    const result = buildLevelPayload(
      level({
        topics: [
          { key: 'a', ar: '', en: 'Tones', zh: '声调' },
          { key: 'b', ...blank },
        ],
        coverImageId: '11111111-1111-4111-8111-111111111111',
      }),
    );
    expect(result).toEqual({
      ok: true,
      payload: {
        slug: 'level-1',
        hanzi: '入门',
        title: { ar: 'البداية', en: 'First steps' },
        summary: { en: 'Pinyin and tones' },
        topics: [{ en: 'Tones', zh: '声调' }],
        priceMinor: null,
        coverImageId: '11111111-1111-4111-8111-111111111111',
      },
    });
  });

  it('never sends a price: every level is free', () => {
    const result = buildLevelPayload(level());
    expect(result.ok && result.payload.priceMinor).toBeNull();
  });

  it('reports required English text, slug, and hanzi problems by field', () => {
    const result = buildLevelPayload(
      level({
        slug: 'Bad Slug',
        hanzi: '',
        title: { ar: 'عنوان', en: '', zh: '' },
        summary: blank,
      }),
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        slug: 'slugInvalid',
        hanzi: 'required',
        'title.en': 'required',
        'summary.en': 'required',
      },
    });
  });

  it('flags an over-long hanzi', () => {
    const result = buildLevelPayload(level({ hanzi: '一二三四五六七八九' }));
    expect(result).toMatchObject({
      ok: false,
      errors: { hanzi: 'hanziTooLong' },
    });
  });

  it('points topic errors at the row the admin sees', () => {
    const result = buildLevelPayload(
      level({
        topics: [
          { key: 'a', ar: '', en: 'Fine', zh: '' },
          { key: 'b', ...blank },
          { key: 'c', ar: 'بلا إنجليزي', en: '', zh: '' },
        ],
      }),
    );
    expect(result).toEqual({
      ok: false,
      errors: { 'topics.2.en': 'required' },
    });
  });
});

describe('buildLessonPayload', () => {
  const lesson = (
    overrides: Partial<LessonFormValues> = {},
  ): LessonFormValues => ({
    title: { ar: '', en: 'Tones', zh: '' },
    description: blank,
    hanzi: '',
    isFreePreview: false,
    thumbnailId: null,
    ...overrides,
  });

  it('turns blank optional fields into null', () => {
    expect(buildLessonPayload(lesson())).toEqual({
      ok: true,
      payload: {
        title: { en: 'Tones' },
        description: null,
        hanzi: null,
        isFreePreview: false,
        thumbnailId: null,
      },
    });
  });

  it('keeps description, hanzi and the preview flag', () => {
    const result = buildLessonPayload(
      lesson({
        description: { ar: '', en: 'About tones', zh: '关于声调' },
        hanzi: '声调',
        isFreePreview: true,
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      payload: {
        description: { en: 'About tones', zh: '关于声调' },
        hanzi: '声调',
        isFreePreview: true,
      },
    });
  });

  it('requires an English title', () => {
    expect(buildLessonPayload(lesson({ title: blank }))).toEqual({
      ok: false,
      errors: { 'title.en': 'required' },
    });
  });
});
