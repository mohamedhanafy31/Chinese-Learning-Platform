import {
  MAX_QUESTION_OPTIONS,
  MIN_QUESTION_OPTIONS,
  QuestionType,
  type LocalizedText,
  type QuestionOptionInput,
} from '@app/shared';

/**
 * Pure validity rules for questions and quizzes. Writes enforce them, so every
 * stored question is valid and readers never need to re-check.
 */

export const TRUE_LABEL: LocalizedText = { en: 'True', ar: 'صح', zh: '对' };
export const FALSE_LABEL: LocalizedText = { en: 'False', ar: 'خطأ', zh: '错' };

export const INVALID_OPTIONS_REASON = 'invalid-options';

/** The two fixed options of a TRUE_FALSE question, True first. */
export function trueFalseOptions(
  trueIsCorrect: boolean,
): QuestionOptionInput[] {
  return [
    { text: { ...TRUE_LABEL }, isCorrect: trueIsCorrect },
    { text: { ...FALSE_LABEL }, isCorrect: !trueIsCorrect },
  ];
}

/** Returns a human-readable violation, or null when the options are valid. */
export function checkOptionRules(
  type: QuestionType,
  options: readonly { isCorrect: boolean }[],
): string | null {
  const correct = options.filter((option) => option.isCorrect).length;
  switch (type) {
    case QuestionType.SINGLE:
      if (
        options.length < MIN_QUESTION_OPTIONS ||
        options.length > MAX_QUESTION_OPTIONS
      ) {
        return `A single-choice question needs ${MIN_QUESTION_OPTIONS} to ${MAX_QUESTION_OPTIONS} options`;
      }
      return correct === 1
        ? null
        : 'A single-choice question needs exactly one correct option';
    case QuestionType.MULTIPLE:
      if (
        options.length < MIN_QUESTION_OPTIONS ||
        options.length > MAX_QUESTION_OPTIONS
      ) {
        return `A multiple-choice question needs ${MIN_QUESTION_OPTIONS} to ${MAX_QUESTION_OPTIONS} options`;
      }
      return correct >= 1
        ? null
        : 'A multiple-choice question needs at least one correct option';
    case QuestionType.TRUE_FALSE:
      if (options.length !== 2) {
        return 'A true/false question needs exactly two options';
      }
      return correct === 1
        ? null
        : 'A true/false question needs exactly one correct option';
  }
}

export type ResolvedOptions =
  { ok: true; options: QuestionOptionInput[] } | { ok: false; message: string };

/**
 * Applies the TRUE_FALSE defaults, then the per-type rules. A TRUE_FALSE
 * question without options needs `correctAnswer` to say which side is right.
 */
export function resolveOptions(
  type: QuestionType,
  options: readonly QuestionOptionInput[],
  correctAnswer: boolean | null,
): ResolvedOptions {
  let resolved = [...options];
  if (type === QuestionType.TRUE_FALSE && resolved.length === 0) {
    if (correctAnswer === null) {
      return {
        ok: false,
        message:
          'A true/false question without options needs correctAnswer (true or false)',
      };
    }
    resolved = trueFalseOptions(correctAnswer);
  }
  const violation = checkOptionRules(type, resolved);
  return violation
    ? { ok: false, message: violation }
    : { ok: true, options: resolved };
}

export interface QuizLiveInput {
  archivedAt: Date | null;
  questionCount: number;
  /** The lesson is visible to this student under `ContentAccessPolicy`. */
  lessonVisible: boolean;
}

/** A quiz students can see and take: not archived, visible lesson, has questions. */
export function isQuizLive({
  archivedAt,
  questionCount,
  lessonVisible,
}: QuizLiveInput): boolean {
  return archivedAt === null && lessonVisible && questionCount >= 1;
}
