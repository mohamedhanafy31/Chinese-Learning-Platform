import {
  DEFAULT_PASSING_SCORE,
  createQuizRequestSchema,
  type AdminQuizSummary,
  type CreateQuizRequest,
} from '@app/shared';

import type { BuildResult, FieldErrors } from '@/lib/admin-forms';
import {
  fromLocalizedInput,
  isLocalizedInputBlank,
  toLocalizedInput,
  type LocalizedInput,
} from '@/lib/localized';

export interface QuizFormValues {
  title: LocalizedInput;
  description: LocalizedInput;
  passingScore: string;
}

export function quizFormValues(quiz?: AdminQuizSummary): QuizFormValues {
  return {
    title: toLocalizedInput(quiz?.title),
    description: toLocalizedInput(quiz?.description),
    passingScore: String(quiz?.passingScore ?? DEFAULT_PASSING_SCORE),
  };
}

export function buildQuizPayload(
  values: QuizFormValues,
): BuildResult<CreateQuizRequest> {
  const raw = values.passingScore.trim();
  const result = createQuizRequestSchema.safeParse({
    title: fromLocalizedInput(values.title),
    description: isLocalizedInputBlank(values.description)
      ? null
      : fromLocalizedInput(values.description),
    passingScore: /^\d{1,3}$/.test(raw) ? Number(raw) : Number.NaN,
  });
  if (result.success) return { ok: true, payload: result.data };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.map(String).join('.');
    errors[path] ??=
      issue.code === 'too_small'
        ? 'required'
        : issue.code === 'too_big'
          ? 'tooLong'
          : 'invalid';
  }
  return { ok: false, errors };
}
