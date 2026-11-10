import {
  MAX_QUESTION_OPTIONS,
  MIN_QUESTION_OPTIONS,
  QuestionType,
  questionRequestSchema,
  type AdminQuestion,
  type QuestionRequest,
} from '@app/shared';

import type { FieldErrors } from '@/lib/admin-forms';
import {
  fromLocalizedInput,
  isLocalizedInputBlank,
  toLocalizedInput,
  type LocalizedInput,
} from '@/lib/localized';

export interface OptionRow {
  /** Client-only key: server option ids change on every save. */
  key: string;
  text: LocalizedInput;
  isCorrect: boolean;
}

export interface QuestionFormValues {
  type: QuestionType;
  prompt: LocalizedInput;
  hanzi: string;
  explanation: LocalizedInput;
  points: string;
  options: OptionRow[];
  /** TRUE_FALSE only: is "True" the right answer. */
  correctAnswer: boolean | null;
  imageId: string | null;
}

let counter = 0;
export function newOptionKey(): string {
  counter += 1;
  return `opt-${counter}`;
}

export function blankOption(isCorrect = false): OptionRow {
  return {
    key: newOptionKey(),
    text: { ar: '', en: '', zh: '' },
    isCorrect,
  };
}

export function blankQuestion(): QuestionFormValues {
  return {
    type: QuestionType.SINGLE,
    prompt: { ar: '', en: '', zh: '' },
    hanzi: '',
    explanation: { ar: '', en: '', zh: '' },
    points: '1',
    options: [blankOption(true), blankOption()],
    correctAnswer: null,
    imageId: null,
  };
}

export function valuesFromQuestion(
  question: AdminQuestion,
): QuestionFormValues {
  const trueFalse = question.type === QuestionType.TRUE_FALSE;
  return {
    type: question.type,
    prompt: toLocalizedInput(question.prompt),
    hanzi: question.hanzi ?? '',
    explanation: toLocalizedInput(question.explanation),
    points: String(question.points),
    // True/False options are API-owned; the editor only shows the answer.
    options: trueFalse
      ? []
      : question.options.map((option) => ({
          key: newOptionKey(),
          text: toLocalizedInput(option.text),
          isCorrect: option.isCorrect,
        })),
    // True is the first option (the API creates it first).
    correctAnswer: trueFalse ? (question.options[0]?.isCorrect ?? null) : null,
    imageId: question.imageId,
  };
}

/** The type switch keeps what still fits: correct flags are normalised. */
export function withType(
  values: QuestionFormValues,
  type: QuestionType,
): QuestionFormValues {
  if (type === values.type) return values;
  if (type === QuestionType.TRUE_FALSE) {
    return {
      ...values,
      type,
      options: [],
      correctAnswer: values.correctAnswer,
    };
  }
  let options =
    values.options.length >= MIN_QUESTION_OPTIONS
      ? values.options
      : [blankOption(true), blankOption()];
  if (type === QuestionType.SINGLE) {
    const first = options.findIndex((option) => option.isCorrect);
    options = options.map((option, index) => ({
      ...option,
      isCorrect: index === (first === -1 ? 0 : first),
    }));
  }
  return { ...values, type, options };
}

export type RuleError =
  | 'optionCount'
  | 'singleCorrect'
  | 'multipleCorrect'
  | 'trueFalseAnswer'
  | 'optionText';

/** Client-side mirror of the API's option rules (the server stays authoritative). */
export function checkRules(values: QuestionFormValues): RuleError[] {
  const errors: RuleError[] = [];
  if (values.type === QuestionType.TRUE_FALSE) {
    if (values.correctAnswer === null) errors.push('trueFalseAnswer');
    return errors;
  }
  const { options } = values;
  if (
    options.length < MIN_QUESTION_OPTIONS ||
    options.length > MAX_QUESTION_OPTIONS
  ) {
    errors.push('optionCount');
  }
  const correct = options.filter((option) => option.isCorrect).length;
  if (values.type === QuestionType.SINGLE && correct !== 1) {
    errors.push('singleCorrect');
  }
  if (values.type === QuestionType.MULTIPLE && correct < 1) {
    errors.push('multipleCorrect');
  }
  if (options.some((option) => !option.text.en.trim())) {
    errors.push('optionText');
  }
  return errors;
}

export type QuestionBuild =
  | { ok: true; payload: QuestionRequest }
  | { ok: false; errors: FieldErrors; rules: RuleError[] };

export function buildQuestionPayload(
  values: QuestionFormValues,
): QuestionBuild {
  const rules = checkRules(values);
  const trueFalse = values.type === QuestionType.TRUE_FALSE;
  const points = Number(values.points.trim());
  const result = questionRequestSchema.safeParse({
    type: values.type,
    prompt: fromLocalizedInput(values.prompt),
    hanzi: values.hanzi.trim() === '' ? null : values.hanzi,
    imageId: values.imageId,
    explanation: isLocalizedInputBlank(values.explanation)
      ? null
      : fromLocalizedInput(values.explanation),
    points: values.points.trim() === '' ? Number.NaN : points,
    options: trueFalse
      ? []
      : values.options.map((option) => ({
          text: fromLocalizedInput(option.text),
          isCorrect: option.isCorrect,
        })),
    correctAnswer: trueFalse ? values.correctAnswer : null,
  });
  const errors: FieldErrors = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.map(String).join('.');
      if (path.startsWith('options') || path === 'correctAnswer') continue;
      errors[path] ??=
        issue.code === 'too_small'
          ? 'required'
          : issue.code === 'too_big'
            ? 'tooLong'
            : 'invalid';
    }
  }
  if (!result.success || rules.length > 0) {
    return { ok: false, errors, rules };
  }
  return { ok: true, payload: result.data };
}
