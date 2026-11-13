import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import type { AuditEntry, Locale } from '@app/shared';

import arMessages from '../../messages/ar.json';
import enMessages from '../../messages/en.json';
import zhMessages from '../../messages/zh.json';
import {
  auditDetails,
  auditEntityHref,
  auditHref,
  auditMessageKey,
  auditPhrase,
  type AuditTranslator,
} from './audit-format';

const messages = { ar: arMessages, en: enMessages, zh: zhMessages };

function translator(locale: Locale): AuditTranslator {
  return createTranslator({
    locale,
    messages: messages[locale],
    namespace: 'Audit',
  }) as unknown as AuditTranslator;
}

const LEVEL = '11111111-1111-4111-8111-111111111111';

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    createdAt: '2026-03-05T10:00:00.000Z',
    action: 'level.publish',
    entity: 'Level',
    entityId: LEVEL,
    entityLabel: { en: 'Beginner', ar: 'البداية', zh: '入门' },
    actor: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Mazen',
      email: 'mazen@example.com',
    },
    data: {},
    ...overrides,
  };
}

describe('auditPhrase', () => {
  it('reads as a sentence in each language, with the name in that language', () => {
    expect(auditPhrase(translator('ar'), entry(), 'ar')).toBe(
      'نشر المستوى «البداية»',
    );
    expect(auditPhrase(translator('en'), entry(), 'en')).toBe(
      'Published the level “Beginner”',
    );
    expect(auditPhrase(translator('zh'), entry(), 'zh')).toBe(
      '发布了级别「入门」',
    );
  });

  it('falls back to English when the title has no translation', () => {
    const label = { en: 'Beginner' };
    expect(
      auditPhrase(translator('ar'), entry({ entityLabel: label }), 'ar'),
    ).toBe('نشر المستوى «Beginner»');
  });

  it('uses a neutral name for a deleted item', () => {
    const gone = entry({
      action: 'level.delete',
      entityLabel: null,
      data: { slug: 'beginner' },
    });
    expect(auditPhrase(translator('en'), gone, 'en')).toBe(
      'Deleted the level “an item that no longer exists”',
    );
    expect(auditPhrase(translator('en'), { ...gone, data: {} }, 'en')).toBe(
      'Deleted the level “an item that no longer exists”',
    );
  });

  it('has a phrase in every language for every recorded action', () => {
    const actions = Object.keys(enMessages.Audit.actions).filter(
      (key) => key !== 'unknown',
    );
    expect(actions.length).toBeGreaterThan(30);
    for (const locale of ['ar', 'en', 'zh'] as const) {
      const keys = Object.keys(messages[locale].Audit.actions).sort();
      expect(keys).toEqual(Object.keys(enMessages.Audit.actions).sort());
    }
  });

  it('shows an unknown action instead of failing', () => {
    expect(
      auditPhrase(translator('en'), entry({ action: 'thing.explode' }), 'en'),
    ).toBe('Updated Beginner');
  });

  it('turns action codes into message keys', () => {
    expect(auditMessageKey('lesson.free_preview')).toBe('lesson_free_preview');
  });
});

describe('auditEntityHref', () => {
  it('links levels, lessons, quizzes and students that still exist', () => {
    expect(auditEntityHref(entry(), 'ar')).toBe(`/ar/admin/levels/${LEVEL}`);
    expect(
      auditEntityHref(entry({ entity: 'Lesson', entityId: 'x' }), 'en'),
    ).toBe('/en/admin/lessons/x');
    expect(
      auditEntityHref(entry({ entity: 'Quiz', entityId: 'x' }), 'en'),
    ).toBe('/en/admin/quizzes/x');
    expect(
      auditEntityHref(entry({ entity: 'Student', entityId: 'x' }), 'zh'),
    ).toBe('/zh/admin/students/x');
  });

  it('does not link what is gone or has no page', () => {
    expect(auditEntityHref(entry({ entityLabel: null }), 'en')).toBeNull();
    expect(
      auditEntityHref(entry({ entity: 'Image', entityLabel: null }), 'en'),
    ).toBeNull();
    expect(
      auditEntityHref(
        entry({ entityId: 'all', entityLabel: null, action: 'level.reorder' }),
        'en',
      ),
    ).toBe('/en/admin/levels');
  });
});

describe('auditDetails', () => {
  it('lists user-facing changed fields and hides internal values', () => {
    const details = auditDetails(
      entry({
        action: 'level.update',
        data: {
          changed: ['title', 'priceMinor', 'summary'],
          values: {
            title: {
              from: { en: 'Old', ar: 'قديم' },
              to: { en: 'New', ar: 'جديد' },
            },
            priceMinor: { from: null, to: 25_000 },
          },
        },
      }),
      'ar',
      'نعم',
      'لا',
    );
    expect(details).toHaveLength(2);
    expect(details[0]).toEqual({ field: 'title', from: 'قديم', to: 'جديد' });
    expect(details[1]).toEqual({ field: 'summary', from: null, to: null });
  });

  it('formats booleans and tolerates malformed data', () => {
    expect(
      auditDetails(
        entry({
          data: {
            changed: ['isFreePreview'],
            values: { isFreePreview: { from: false, to: true } },
          },
        }),
        'en',
        'Yes',
        'No',
      ),
    ).toEqual([{ field: 'isFreePreview', from: 'No', to: 'Yes' }]);
    expect(
      auditDetails(
        entry({ data: { changed: 'nope', values: 5 } }),
        'en',
        'Y',
        'N',
      ),
    ).toEqual([]);
  });
});

describe('auditHref', () => {
  it('keeps defaults out of the URL', () => {
    expect(auditHref('ar', {})).toBe('/ar/admin/audit');
    expect(
      auditHref('en', { entity: 'Level', entityId: LEVEL, action: '' }, 2),
    ).toBe(`/en/admin/audit?entity=Level&entityId=${LEVEL}&page=2`);
  });
});
