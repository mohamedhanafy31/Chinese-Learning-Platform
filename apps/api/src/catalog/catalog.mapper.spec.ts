import {
  parseLocalizedText,
  parseOptionalLocalizedText,
  parseTopics,
  toPublicLevel,
  type LevelRow,
} from './catalog.mapper';

describe('parsing DB JSON', () => {
  it('parses and trims valid localized text', () => {
    expect(parseLocalizedText({ en: ' Hi ', ar: 'مرحبا' })).toEqual({
      en: 'Hi',
      ar: 'مرحبا',
    });
  });

  it.each([null, 'text', 42, [], {}, { en: '' }, { en: 1 }, { ar: 'x' }])(
    'rejects malformed localized text %j',
    (value) => {
      expect(() => parseLocalizedText(value)).toThrow();
    },
  );

  it('treats a missing optional text as null', () => {
    expect(parseOptionalLocalizedText(null)).toBeNull();
    expect(parseOptionalLocalizedText(undefined)).toBeNull();
    expect(() => parseOptionalLocalizedText({ en: '' })).toThrow();
  });

  it('rejects topics that are not an array of localized text or exceed 12', () => {
    expect(parseTopics([{ en: 'One' }])).toEqual([{ en: 'One' }]);
    expect(() => parseTopics({ en: 'One' })).toThrow();
    expect(() => parseTopics([{ zh: '一' }])).toThrow();
    expect(() =>
      parseTopics(Array.from({ length: 13 }, () => ({ en: 'x' }))),
    ).toThrow();
  });

  it('fails the public mapping when a row holds a corrupt JSON column', () => {
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'level-1',
      hanzi: '入门',
      title: { en: 'Title' },
      summary: 'not an object',
      topics: [],
      priceMinor: null,
      currency: 'EGP',
      sortOrder: 1,
      isPublished: true,
      firstPublishedAt: new Date(),
      archivedAt: null,
      coverImageId: null,
      coverImage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies LevelRow;
    expect(() => toPublicLevel(row, 1, 0)).toThrow();
  });
});
