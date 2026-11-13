import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LessonProgress } from '@app/shared';

import type * as ApiClient from '@/lib/api-client';

import en from '../../../messages/en.json';

const apiFetch = vi.fn();
vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<typeof ApiClient>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  apiFetchParsed: (path: string, _schema: unknown, init?: RequestInit) =>
    apiFetch(path, init),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { LessonStage } = await import('./lesson-stage');

const lessonId = '00000000-0000-4000-8000-0000000000aa';
const base: LessonProgress = {
  watchedPercent: 0,
  lastPositionSec: 0,
  videoComplete: false,
  complete: false,
  quizzes: { total: 0, passed: 0 },
  hasVideo: false,
  nextLessonId: null,
};

function show(progress: LessonProgress | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LessonStage
        levelSlug="starter"
        lessonId={lessonId}
        label="Lesson"
        poster={null}
        progress={progress}
        video={null}
      />
    </NextIntlClientProvider>,
  );
}

describe('LessonStage opening report', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        watchedPercent: 0,
        videoComplete: false,
        complete: true,
        nextLessonId: null,
      },
    });
  });
  afterEach(cleanup);

  it('does not report an empty lesson as progress', async () => {
    show(base);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('sends nothing for anonymous viewers, quizzes or a finished lesson', async () => {
    show(null);
    cleanup();
    show({ ...base, quizzes: { total: 1, passed: 0 } });
    cleanup();
    show({ ...base, complete: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
