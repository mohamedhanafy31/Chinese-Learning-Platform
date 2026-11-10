import { describe, expect, it } from 'vitest';

import {
  blankOption,
  blankQuestion,
  buildQuestionPayload,
  checkRules,
  withType,
  type QuestionFormValues,
} from '@/lib/question-editor';

function filled(patch: Partial<QuestionFormValues> = {}): QuestionFormValues {
  const base = blankQuestion();
  return {
    ...base,
    prompt: { ar: '', en: 'Pick one', zh: '' },
    options: [
      { ...blankOption(true), text: { ar: '', en: 'A', zh: '' } },
      { ...blankOption(), text: { ar: '', en: 'B', zh: '' } },
    ],
    ...patch,
  };
}

describe('question rule mirror', () => {
  it('accepts exactly one correct option for single choice', () => {
    expect(checkRules(filled())).toEqual([]);
    const two = filled();
    two.options = two.options.map((o) => ({ ...o, isCorrect: true }));
    expect(checkRules(two)).toContain('singleCorrect');
    const none = filled();
    none.options = none.options.map((o) => ({ ...o, isCorrect: false }));
    expect(checkRules(none)).toContain('singleCorrect');
  });

  it('needs at least one correct option for multiple choice', () => {
    const multi = withType(filled(), 'MULTIPLE');
    multi.options = multi.options.map((o) => ({ ...o, isCorrect: true }));
    expect(checkRules(multi)).toEqual([]);
    multi.options = multi.options.map((o) => ({ ...o, isCorrect: false }));
    expect(checkRules(multi)).toContain('multipleCorrect');
  });

  it('enforces 2 to 8 options and option text', () => {
    const one = filled();
    one.options = one.options.slice(0, 1);
    expect(checkRules(one)).toContain('optionCount');
    const nine = filled();
    nine.options = Array.from({ length: 9 }, (_, i) => ({
      ...blankOption(i === 0),
      text: { ar: '', en: 'x', zh: '' },
    }));
    expect(checkRules(nine)).toContain('optionCount');
    const blank = filled();
    blank.options = [blank.options[0]!, blankOption()];
    expect(checkRules(blank)).toContain('optionText');
  });

  it('switching to single keeps one correct option', () => {
    const multi = withType(filled(), 'MULTIPLE');
    multi.options = multi.options.map((o) => ({ ...o, isCorrect: true }));
    const single = withType(multi, 'SINGLE');
    expect(single.options.filter((o) => o.isCorrect)).toHaveLength(1);
  });

  it('true/false needs an answer and sends correctAnswer with no options', () => {
    const tf = withType(filled(), 'TRUE_FALSE');
    expect(checkRules(tf)).toEqual(['trueFalseAnswer']);
    const built = buildQuestionPayload({ ...tf, correctAnswer: false });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.payload.options).toEqual([]);
      expect(built.payload.correctAnswer).toBe(false);
      expect(built.payload.type).toBe('TRUE_FALSE');
    }
  });

  it('reports field errors for a missing English prompt and bad points', () => {
    const built = buildQuestionPayload(
      filled({ prompt: { ar: '', en: '', zh: '' }, points: '0' }),
    );
    expect(built.ok).toBe(false);
    if (!built.ok) {
      expect(built.errors['prompt.en']).toBe('required');
      expect(built.errors.points).toBeDefined();
    }
  });
});
