import {
  QuestionType,
  type AttemptAnswer,
  type LearnerQuiz,
} from '@app/shared';

/** Chosen option ids per question id. */
export type Draft = Record<string, string[]>;

const draftKey = (quizId: string): string => `quiz-draft:${quizId}`;

/** Selection after the learner activates one option. */
export function toggleOption(
  type: QuestionType,
  current: readonly string[],
  optionId: string,
): string[] {
  if (type !== QuestionType.MULTIPLE) return [optionId];
  return current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : [...current, optionId];
}

export function isAnswered(draft: Draft, questionId: string): boolean {
  return (draft[questionId]?.length ?? 0) > 0;
}

export function answeredCount(quiz: LearnerQuiz, draft: Draft): number {
  return quiz.questions.filter((q) => isAnswered(draft, q.id)).length;
}

/** The submit body, options in the question's own order. */
export function toAnswers(quiz: LearnerQuiz, draft: Draft): AttemptAnswer[] {
  return quiz.questions.map((question) => ({
    questionId: question.id,
    optionIds: question.options
      .map((option) => option.id)
      .filter((id) => draft[question.id]?.includes(id)),
  }));
}

/** Drops anything that no longer matches the quiz (edited since the draft). */
export function sanitizeDraft(quiz: LearnerQuiz, raw: unknown): Draft {
  const draft: Draft = {};
  if (typeof raw !== 'object' || raw === null) return draft;
  for (const question of quiz.questions) {
    const value = (raw as Record<string, unknown>)[question.id];
    if (!Array.isArray(value)) continue;
    const valid = question.options
      .map((option) => option.id)
      .filter((id) => value.includes(id));
    const kept =
      question.type === QuestionType.MULTIPLE ? valid : valid.slice(0, 1);
    if (kept.length > 0) draft[question.id] = kept;
  }
  return draft;
}

/** Storage can throw (private mode, quota, disabled): never let it break the sheet. */
export function loadDraft(quiz: LearnerQuiz): Draft {
  try {
    const raw = window.sessionStorage.getItem(draftKey(quiz.id));
    return raw ? sanitizeDraft(quiz, JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function saveDraft(quizId: string, draft: Draft): void {
  try {
    window.sessionStorage.setItem(draftKey(quizId), JSON.stringify(draft));
  } catch {
    // keep going without persistence
  }
}

export function clearDraft(quizId: string): void {
  try {
    window.sessionStorage.removeItem(draftKey(quizId));
  } catch {
    // nothing to clear
  }
}

/** Per-question messages out of a 400 `{ issues: [{ questionId, message }] }`. */
export function issueQuestionIds(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || !('issues' in body)) {
    return [];
  }
  const { issues } = body as { issues: unknown };
  if (!Array.isArray(issues)) return [];
  const ids: string[] = [];
  for (const issue of issues) {
    if (
      typeof issue === 'object' &&
      issue !== null &&
      'questionId' in issue &&
      typeof issue.questionId === 'string' &&
      !ids.includes(issue.questionId)
    ) {
      ids.push(issue.questionId);
    }
  }
  return ids;
}
