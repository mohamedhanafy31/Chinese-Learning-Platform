import { expect, type APIRequestContext } from '@playwright/test';

/** Adds the smallest live quiz accepted by the lesson publish policy. */
export async function makeLessonPublishable(
  api: APIRequestContext,
  lessonId: string,
): Promise<string> {
  const quizResponse = await api.post(
    `/api/v1/admin/lessons/${lessonId}/quizzes`,
    { data: { title: { en: 'Publish readiness' } } },
  );
  expect(quizResponse.status()).toBe(201);
  const quizId = ((await quizResponse.json()) as { id: string }).id;
  const question = await api.post(`/api/v1/admin/quizzes/${quizId}/questions`, {
    data: {
      type: 'TRUE_FALSE',
      prompt: { en: 'Ready?' },
      correctAnswer: true,
    },
  });
  expect(question.status()).toBe(201);
  return quizId;
}

export async function archivePublishableContent(
  api: APIRequestContext,
  quizId: string,
): Promise<void> {
  expect(
    (await api.post(`/api/v1/admin/quizzes/${quizId}/archive`)).status(),
  ).toBe(200);
}
