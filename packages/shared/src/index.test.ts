import { describe, expect, it } from 'vitest';

import { localizedTextSchema } from './index';

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
