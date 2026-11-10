import type { QuestionType } from '@app/shared';

import {
  buildSnapshot,
  grade,
  hasPassed,
  validateAnswers,
  type GradableQuestion,
  type SnapshotQuestion,
} from './quiz-grading';

const id = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function question(
  n: number,
  type: QuestionType,
  correct: number[],
  total = 4,
  points = 1,
): GradableQuestion {
  return {
    id: id(n * 100),
    type,
    points,
    options: Array.from({ length: total }, (_, index) => ({
      id: id(n * 100 + index + 1),
      isCorrect: correct.includes(index),
    })),
  };
}

const pick = (q: GradableQuestion, ...indexes: number[]) => ({
  questionId: q.id,
  optionIds: indexes.map((index) => q.options[index]!.id),
});

describe('grade', () => {
  const single = question(1, 'SINGLE', [1]);
  const multiple = question(2, 'MULTIPLE', [0, 2]);
  const trueFalse = question(3, 'TRUE_FALSE', [0], 2);

  it('scores a single-choice question right and wrong', () => {
    expect(grade([single], [pick(single, 1)])).toMatchObject({
      earnedPoints: 1,
      totalPoints: 1,
      score: 100,
    });
    expect(grade([single], [pick(single, 0)])).toMatchObject({
      earnedPoints: 0,
      score: 0,
    });
  });

  it('is all-or-nothing for a multiple-choice question', () => {
    const exact = grade([multiple], [pick(multiple, 2, 0)]);
    expect(exact.score).toBe(100);
    expect(exact.outcomes[0]).toMatchObject({
      correct: true,
      chosen: [multiple.options[0]!.id, multiple.options[2]!.id],
    });
    expect(grade([multiple], [pick(multiple, 0)]).score).toBe(0); // partial
    expect(grade([multiple], [pick(multiple, 0, 1, 2)]).score).toBe(0); // superset
    expect(grade([multiple], [pick(multiple, 1, 3)]).score).toBe(0); // disjoint
    expect(grade([multiple], [pick(multiple)]).score).toBe(0); // empty
  });

  it('grades true/false', () => {
    expect(grade([trueFalse], [pick(trueFalse, 0)]).score).toBe(100);
    expect(grade([trueFalse], [pick(trueFalse, 1)]).score).toBe(0);
  });

  it('weights questions by points', () => {
    const heavy = question(4, 'SINGLE', [0], 3, 3);
    const light = question(5, 'SINGLE', [0], 3, 1);
    const result = grade([heavy, light], [pick(heavy, 0), pick(light, 1)]);
    expect(result).toMatchObject({
      earnedPoints: 3,
      totalPoints: 4,
      score: 75,
    });
  });

  it('floors the percentage with integer math', () => {
    const qs = [1, 2, 3].map((n) => question(n, 'SINGLE', [0]));
    const answers = [pick(qs[0]!, 0), pick(qs[1]!, 0), pick(qs[2]!, 1)];
    expect(grade(qs, answers).score).toBe(66); // 2/3
    expect(
      grade(qs, [pick(qs[0]!, 0), pick(qs[1]!, 1), pick(qs[2]!, 1)]).score,
    ).toBe(33);
  });

  it('handles the passing-score edges', () => {
    expect(hasPassed(0, 0)).toBe(true);
    expect(hasPassed(100, 100)).toBe(true);
    expect(hasPassed(99, 100)).toBe(false);
    expect(hasPassed(70, 70)).toBe(true);
    expect(hasPassed(69, 70)).toBe(false);
  });

  it('reports outcomes in question order', () => {
    const result = grade(
      [single, multiple],
      [pick(multiple, 0, 2), pick(single, 0)],
    );
    expect(result.outcomes.map((o) => [o.questionId, o.correct])).toEqual([
      [single.id, false],
      [multiple.id, true],
    ]);
  });
});

describe('validateAnswers', () => {
  const single = question(1, 'SINGLE', [0]);
  const multiple = question(2, 'MULTIPLE', [0, 1]);
  const questions = [single, multiple];
  const valid = [pick(single, 0), pick(multiple, 0, 1)];

  it('accepts a complete, well-formed submission', () => {
    expect(validateAnswers(questions, valid)).toEqual([]);
  });

  it('rejects a missing answer', () => {
    expect(validateAnswers(questions, [pick(single, 0)])).toEqual([
      { questionId: multiple.id, message: 'Question not answered' },
    ]);
  });

  it('rejects unknown and duplicate question ids', () => {
    const unknown = { questionId: id(999), optionIds: [id(1)] };
    expect(validateAnswers(questions, [...valid, unknown])[0]).toMatchObject({
      questionId: id(999),
      message: 'Unknown question',
    });
    expect(
      validateAnswers(questions, [...valid, pick(single, 1)])[0],
    ).toMatchObject({
      questionId: single.id,
      message: 'Question answered more than once',
    });
  });

  it('rejects options of another question and duplicate options', () => {
    const foreign = {
      questionId: single.id,
      optionIds: [multiple.options[0]!.id],
    };
    expect(
      validateAnswers(questions, [foreign, valid[1]!])[0]?.message,
    ).toMatch(/does not belong/);
    const twice = {
      questionId: multiple.id,
      optionIds: [multiple.options[0]!.id, multiple.options[0]!.id],
    };
    expect(
      validateAnswers(questions, [valid[0]!, twice]).some((p) =>
        /more than once/.test(p.message),
      ),
    ).toBe(true);
  });

  it('enforces the option count per type', () => {
    expect(validateAnswers(questions, [pick(single, 0, 1), valid[1]!])).toEqual(
      [{ questionId: single.id, message: 'Choose exactly one option' }],
    );
    expect(validateAnswers(questions, [pick(single), valid[1]!])).toEqual([
      { questionId: single.id, message: 'Choose exactly one option' },
    ]);
    expect(validateAnswers(questions, [valid[0]!, pick(multiple)])).toEqual([
      { questionId: multiple.id, message: 'Choose at least one option' },
    ]);
    const tf = question(3, 'TRUE_FALSE', [0], 2);
    expect(validateAnswers([tf], [pick(tf, 0, 1)])).toHaveLength(1);
    expect(validateAnswers([tf], [pick(tf, 1)])).toEqual([]);
  });
});

describe('buildSnapshot', () => {
  it('freezes prompts, options, correctness and the learner choice', () => {
    const base = question(1, 'SINGLE', [1], 2, 2);
    const q: SnapshotQuestion = {
      ...base,
      prompt: { en: 'Pick', zh: '选' },
      hanzi: '你好',
      explanation: { en: 'Because' },
      options: base.options.map((option, index) => ({
        ...option,
        text: { en: `Option ${index}` },
      })),
    };
    const { outcomes } = grade([q], [pick(q, 0)]);
    const snapshot = buildSnapshot(70, [q], outcomes);
    expect(snapshot).toEqual({
      version: 1,
      passingScore: 70,
      questions: [
        {
          id: q.id,
          type: 'SINGLE',
          prompt: { en: 'Pick', zh: '选' },
          hanzi: '你好',
          points: 2,
          explanation: { en: 'Because' },
          options: [
            {
              id: q.options[0]!.id,
              text: { en: 'Option 0' },
              isCorrect: false,
            },
            { id: q.options[1]!.id, text: { en: 'Option 1' }, isCorrect: true },
          ],
          chosen: [q.options[0]!.id],
          correct: false,
        },
      ],
    });
  });
});
