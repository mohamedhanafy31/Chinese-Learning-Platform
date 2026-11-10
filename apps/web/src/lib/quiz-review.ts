import type {
  AttemptDetail,
  LearnerQuiz,
  LocalizedText,
  QuestionImage,
  QuestionType,
  SubmitAttemptResponse,
} from '@app/shared';

export interface ReviewQuestion {
  id: string;
  type: QuestionType;
  prompt: LocalizedText;
  hanzi: string | null;
  image: QuestionImage | null;
  explanation: LocalizedText | null;
  correct: boolean;
  chosen: string[];
  options: { id: string; text: LocalizedText; isCorrect: boolean }[];
}

export interface ReviewModel {
  attemptId: string;
  score: number;
  earnedPoints: number;
  totalPoints: number;
  passed: boolean;
  passingScore: number;
  questions: ReviewQuestion[];
}

/** The review of an attempt that was just submitted, from the sheet and the grading response. */
export function reviewFromSubmit(
  quiz: LearnerQuiz,
  response: SubmitAttemptResponse,
): ReviewModel {
  const results = new Map(response.results.map((r) => [r.questionId, r]));
  return {
    attemptId: response.attempt.id,
    score: response.attempt.score,
    earnedPoints: response.attempt.earnedPoints,
    totalPoints: response.attempt.totalPoints,
    passed: response.attempt.passed,
    passingScore: quiz.passingScore,
    questions: quiz.questions.map((question) => {
      const result = results.get(question.id);
      const correctIds = new Set(result?.correctOptionIds ?? []);
      return {
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        hanzi: question.hanzi,
        image: question.image,
        explanation: result?.explanation ?? null,
        correct: result?.correct ?? false,
        chosen: result?.chosen ?? [],
        options: question.options.map((option) => ({
          id: option.id,
          text: option.text,
          isCorrect: correctIds.has(option.id),
        })),
      };
    }),
  };
}

/** The review of a past attempt, from its stored snapshot. */
export function reviewFromAttempt(detail: AttemptDetail): ReviewModel {
  return {
    attemptId: detail.attempt.id,
    score: detail.attempt.score,
    earnedPoints: detail.attempt.earnedPoints,
    totalPoints: detail.attempt.totalPoints,
    passed: detail.attempt.passed,
    passingScore: detail.attempt.passingScore,
    questions: detail.questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      hanzi: question.hanzi,
      image: null,
      explanation: question.explanation,
      correct: question.correct,
      chosen: question.chosen,
      options: question.options,
    })),
  };
}
