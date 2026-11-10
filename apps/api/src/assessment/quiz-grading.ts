import {
  QuestionType,
  type AttemptAnswer,
  type AttemptSnapshot,
  type LocalizedText,
} from '@app/shared';

/** The pure grading core: no database, no HTTP. */

export interface GradableOption {
  id: string;
  isCorrect: boolean;
}

export interface GradableQuestion {
  id: string;
  type: QuestionType;
  points: number;
  options: readonly GradableOption[];
}

export interface QuestionOutcome {
  questionId: string;
  correct: boolean;
  /** Chosen option ids in the question's option order. */
  chosen: string[];
}

export interface GradeResult {
  earnedPoints: number;
  totalPoints: number;
  /** Integer percentage, rounded down. */
  score: number;
  outcomes: QuestionOutcome[];
}

export interface AnswerProblem {
  questionId: string | null;
  message: string;
}

/**
 * Checks the shape of a submission against the live questions. Every question
 * must be answered exactly once; option ids must belong to that question and
 * be unique; SINGLE and TRUE_FALSE take one option, MULTIPLE at least one.
 */
export function validateAnswers(
  questions: readonly GradableQuestion[],
  answers: readonly AttemptAnswer[],
): AnswerProblem[] {
  const problems: AnswerProblem[] = [];
  const byId = new Map(questions.map((question) => [question.id, question]));
  const answered = new Set<string>();

  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    if (!question) {
      problems.push({
        questionId: answer.questionId,
        message: 'Unknown question',
      });
      continue;
    }
    if (answered.has(question.id)) {
      problems.push({
        questionId: question.id,
        message: 'Question answered more than once',
      });
      continue;
    }
    answered.add(question.id);

    const own = new Set(question.options.map((option) => option.id));
    const seen = new Set<string>();
    for (const optionId of answer.optionIds) {
      if (!own.has(optionId)) {
        problems.push({
          questionId: question.id,
          message: `Option ${optionId} does not belong to this question`,
        });
      }
      if (seen.has(optionId)) {
        problems.push({
          questionId: question.id,
          message: `Option ${optionId} chosen more than once`,
        });
      }
      seen.add(optionId);
    }
    const needsExactlyOne = question.type !== QuestionType.MULTIPLE;
    if (needsExactlyOne && answer.optionIds.length !== 1) {
      problems.push({
        questionId: question.id,
        message: 'Choose exactly one option',
      });
    } else if (!needsExactlyOne && answer.optionIds.length < 1) {
      problems.push({
        questionId: question.id,
        message: 'Choose at least one option',
      });
    }
  }

  for (const question of questions) {
    if (!answered.has(question.id)) {
      problems.push({
        questionId: question.id,
        message: 'Question not answered',
      });
    }
  }
  return problems;
}

/**
 * Grades a valid submission. A question earns its points only when the chosen
 * set equals the correct set exactly (all-or-nothing, also for MULTIPLE).
 * Integer math only: `score = floor(earned * 100 / total)`.
 */
export function grade(
  questions: readonly GradableQuestion[],
  answers: readonly AttemptAnswer[],
): GradeResult {
  const chosenBy = new Map(
    answers.map((answer) => [answer.questionId, new Set(answer.optionIds)]),
  );
  let earnedPoints = 0;
  let totalPoints = 0;
  const outcomes: QuestionOutcome[] = [];

  for (const question of questions) {
    const chosenSet = chosenBy.get(question.id) ?? new Set<string>();
    const correctIds = question.options
      .filter((option) => option.isCorrect)
      .map((option) => option.id);
    const correct =
      chosenSet.size === correctIds.length &&
      correctIds.every((id) => chosenSet.has(id));
    totalPoints += question.points;
    if (correct) earnedPoints += question.points;
    outcomes.push({
      questionId: question.id,
      correct,
      chosen: question.options
        .filter((option) => chosenSet.has(option.id))
        .map((option) => option.id),
    });
  }

  const score =
    totalPoints === 0 ? 0 : Math.floor((earnedPoints * 100) / totalPoints);
  return { earnedPoints, totalPoints, score, outcomes };
}

export function hasPassed(score: number, passingScore: number): boolean {
  return score >= passingScore;
}

export interface SnapshotQuestion extends GradableQuestion {
  prompt: LocalizedText;
  hanzi: string | null;
  explanation: LocalizedText | null;
  options: readonly (GradableOption & { text: LocalizedText })[];
}

/** Freezes the questions as the learner saw them, with their outcome. */
export function buildSnapshot(
  passingScore: number,
  questions: readonly SnapshotQuestion[],
  outcomes: readonly QuestionOutcome[],
): AttemptSnapshot {
  const outcomeBy = new Map(
    outcomes.map((outcome) => [outcome.questionId, outcome]),
  );
  return {
    version: 1,
    passingScore,
    questions: questions.map((question) => {
      const outcome = outcomeBy.get(question.id);
      return {
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        hanzi: question.hanzi,
        points: question.points,
        explanation: question.explanation,
        options: question.options.map((option) => ({
          id: option.id,
          text: option.text,
          isCorrect: option.isCorrect,
        })),
        chosen: outcome?.chosen ?? [],
        correct: outcome?.correct ?? false,
      };
    }),
  };
}
