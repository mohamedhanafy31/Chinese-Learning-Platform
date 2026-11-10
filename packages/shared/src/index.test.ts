import { describe, expect, it } from 'vitest';

import {
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
