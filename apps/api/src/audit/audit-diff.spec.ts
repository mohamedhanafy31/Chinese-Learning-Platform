import {
  diffAudit,
  diffData,
  isSecretField,
  scrubAuditData,
} from './audit-diff';

describe('diffAudit', () => {
  it('records only the fields that changed', () => {
    const diff = diffAudit(
      { slug: 'a', priceMinor: 100, hanzi: '入门' },
      { slug: 'a', priceMinor: 200, hanzi: '入门' },
      ['slug', 'priceMinor', 'hanzi'],
      ['slug', 'priceMinor'],
    );
    expect(diff.changed).toEqual(['priceMinor']);
    expect(diff.values).toEqual({ priceMinor: { from: 100, to: 200 } });
  });

  it('skips unchanged fields and compares nested values by content', () => {
    const diff = diffAudit(
      { title: { en: 'A', ar: 'ب' }, topics: [{ en: 'x' }] },
      { title: { ar: 'ب', en: 'A' }, topics: [{ en: 'y' }] },
      ['title', 'topics'],
      ['title'],
    );
    expect(diff.changed).toEqual(['topics']);
    expect(diff.values).toEqual({});
  });

  it('treats a missing value and null as the same', () => {
    const diff = diffAudit({ hanzi: undefined }, { hanzi: null }, ['hanzi']);
    expect(diff.changed).toEqual([]);
  });

  it('names a changed field without its value unless it is a value field', () => {
    const diff = diffAudit(
      { summary: { en: 'old' } },
      { summary: { en: 'new' } },
      ['summary'],
    );
    expect(diff.changed).toEqual(['summary']);
    expect(diff.values).toEqual({});
    expect(diffData(diff)).toEqual({ changed: ['summary'] });
  });

  it('never includes secret fields, even when asked to', () => {
    const diff = diffAudit(
      {
        passwordHash: 'a',
        refreshTokenHash: 'a',
        clientSecret: 'a',
        title: 'a',
      },
      {
        passwordHash: 'b',
        refreshTokenHash: 'b',
        clientSecret: 'b',
        title: 'b',
      },
      ['passwordHash', 'refreshTokenHash', 'clientSecret', 'title'],
      ['passwordHash', 'clientSecret', 'title'],
    );
    expect(diff.changed).toEqual(['title']);
    expect(JSON.stringify(diff)).not.toMatch(/Hash|Secret|"b"[^}]*"b"/);
  });

  it('marks phone and email as changed without recording their values', () => {
    const diff = diffAudit(
      { email: 'old@example.com', phone: '+201000000001' },
      { email: 'new@example.com', phone: '+201000000002' },
      ['email', 'phone'],
      ['email', 'phone'],
    );
    expect(diff.changed).toEqual(['email', 'phone']);
    expect(diff.values).toEqual({});
    expect(JSON.stringify(diff)).not.toContain('example.com');
  });
});

describe('scrubAuditData', () => {
  it('drops secret keys and masks personal identifiers at any depth', () => {
    expect(
      scrubAuditData({
        levelId: 'x',
        nested: {
          token: 't',
          phone: '+20100',
          list: [{ password: 'p', ok: 1 }],
        },
        email: 'a@b.c',
        cardNumber: '4111',
      }),
    ).toEqual({
      levelId: 'x',
      nested: { phone: 'changed', list: [{ ok: 1 }] },
      email: 'changed',
    });
  });

  it('flags the usual secret names', () => {
    for (const name of [
      'password',
      'passwordHash',
      'refreshToken',
      'clientSecret',
      'cardNumber',
      'apiKey',
      'hmac',
    ]) {
      expect(isSecretField(name)).toBe(true);
    }
    for (const name of ['title', 'slug', 'priceMinor', 'isPublished']) {
      expect(isSecretField(name)).toBe(false);
    }
  });
});
