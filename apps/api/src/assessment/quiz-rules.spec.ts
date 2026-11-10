import { QuestionType } from '@app/shared';

import {
  checkOptionRules,
  isQuizLive,
  resolveOptions,
  trueFalseOptions,
} from './quiz-rules';

const options = (correct: number, total: number) =>
  Array.from({ length: total }, (_, index) => ({
    text: { en: `Option ${index + 1}` },
    isCorrect: index < correct,
  }));

describe('checkOptionRules', () => {
  const table: [QuestionType, number, number, boolean][] = [
    // type, correct, total, valid
    ['SINGLE', 1, 1, false],
    ['SINGLE', 1, 2, true],
    ['SINGLE', 1, 8, true],
    ['SINGLE', 1, 9, false],
    ['SINGLE', 0, 4, false],
    ['SINGLE', 2, 4, false],
    ['SINGLE', 4, 4, false],
    ['MULTIPLE', 1, 1, false],
    ['MULTIPLE', 1, 2, true],
    ['MULTIPLE', 2, 4, true],
    ['MULTIPLE', 4, 4, true],
    ['MULTIPLE', 8, 8, true],
    ['MULTIPLE', 1, 9, false],
    ['MULTIPLE', 0, 4, false],
    ['TRUE_FALSE', 1, 2, true],
    ['TRUE_FALSE', 0, 2, false],
    ['TRUE_FALSE', 2, 2, false],
    ['TRUE_FALSE', 1, 1, false],
    ['TRUE_FALSE', 1, 3, false],
    ['TRUE_FALSE', 0, 0, false],
  ];

  it.each(table)(
    '%s with %i correct of %i options',
    (type, correct, total, valid) => {
      const violation = checkOptionRules(type, options(correct, total));
      expect(violation === null).toBe(valid);
      if (!valid) expect(typeof violation).toBe('string');
    },
  );
});

describe('resolveOptions', () => {
  it('creates localized True/False options for an optionless TRUE_FALSE', () => {
    const resolved = resolveOptions(QuestionType.TRUE_FALSE, [], true);
    expect(resolved).toEqual({
      ok: true,
      options: [
        { text: { en: 'True', ar: 'صح', zh: '对' }, isCorrect: true },
        { text: { en: 'False', ar: 'خطأ', zh: '错' }, isCorrect: false },
      ],
    });
    expect(resolveOptions(QuestionType.TRUE_FALSE, [], false)).toEqual({
      ok: true,
      options: trueFalseOptions(false),
    });
  });

  it('needs correctAnswer when a TRUE_FALSE has no options', () => {
    expect(resolveOptions(QuestionType.TRUE_FALSE, [], null)).toMatchObject({
      ok: false,
    });
  });

  it('keeps explicit TRUE_FALSE options and ignores correctAnswer', () => {
    const given = options(1, 2);
    expect(resolveOptions(QuestionType.TRUE_FALSE, given, false)).toEqual({
      ok: true,
      options: given,
    });
  });

  it('does not invent options for the other types', () => {
    expect(resolveOptions(QuestionType.SINGLE, [], true)).toMatchObject({
      ok: false,
    });
  });
});

describe('isQuizLive', () => {
  const base = { archivedAt: null, questionCount: 1, lessonVisible: true };

  it('is live only when not archived, visible and non-empty', () => {
    expect(isQuizLive(base)).toBe(true);
    expect(isQuizLive({ ...base, archivedAt: new Date() })).toBe(false);
    expect(isQuizLive({ ...base, questionCount: 0 })).toBe(false);
    expect(isQuizLive({ ...base, lessonVisible: false })).toBe(false);
  });
});
