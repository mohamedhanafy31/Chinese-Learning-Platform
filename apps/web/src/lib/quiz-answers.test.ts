import { describe, expect, it } from 'vitest';

import type { LearnerQuiz } from '@app/shared';

import {
  issueQuestionIds,
  sanitizeDraft,
  toAnswers,
  toggleOption,
} from '@/lib/quiz-answers';

const quiz = {
  questions: [
    { id: 'q1', type: 'SINGLE', options: [{ id: 'a' }, { id: 'b' }] },
    { id: 'q2', type: 'MULTIPLE', options: [{ id: 'c' }, { id: 'd' }] },
  ],
} as unknown as LearnerQuiz;

describe('quiz answers', () => {
  it('replaces for single and toggles for multiple', () => {
    expect(toggleOption('SINGLE', ['a'], 'b')).toEqual(['b']);
    expect(toggleOption('TRUE_FALSE', [], 'b')).toEqual(['b']);
    expect(toggleOption('MULTIPLE', ['c'], 'd')).toEqual(['c', 'd']);
    expect(toggleOption('MULTIPLE', ['c', 'd'], 'c')).toEqual(['d']);
  });

  it('builds answers in option order and sanitizes stale drafts', () => {
    expect(toAnswers(quiz, { q1: ['b'], q2: ['d', 'c'] })).toEqual([
      { questionId: 'q1', optionIds: ['b'] },
      { questionId: 'q2', optionIds: ['c', 'd'] },
    ]);
    expect(
      sanitizeDraft(quiz, { q1: ['a', 'b', 'zz'], q2: ['zz'], q9: ['a'] }),
    ).toEqual({
      q1: ['a'],
    });
    expect(sanitizeDraft(quiz, 'nope')).toEqual({});
  });

  it('reads question ids from a 400 issues body', () => {
    expect(
      issueQuestionIds({
        issues: [
          { questionId: 'q2', message: 'x' },
          { questionId: 'q2', message: 'y' },
          { questionId: null, message: 'z' },
        ],
      }),
    ).toEqual(['q2']);
    expect(issueQuestionIds(null)).toEqual([]);
    expect(issueQuestionIds({ issues: 'x' })).toEqual([]);
  });
});
