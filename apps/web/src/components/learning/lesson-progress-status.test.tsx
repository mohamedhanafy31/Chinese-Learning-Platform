import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Locale } from '@app/shared';

import ar from '../../../messages/ar.json';
import en from '../../../messages/en.json';
import zh from '../../../messages/zh.json';
import {
  LessonProgressStatus,
  type StatusProgress,
} from './lesson-progress-status';

const messages = { ar, en, zh };

const next = '00000000-0000-4000-8000-0000000000bb';
const base: StatusProgress = {
  watchedPercent: 80,
  complete: false,
  hasVideo: true,
  quizzes: { total: 2, passed: 1 },
  nextLessonId: null,
};

function show(locale: Locale, progress: Partial<StatusProgress> = {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <LessonProgressStatus
        levelSlug="starter"
        progress={{ ...base, ...progress }}
      />
    </NextIntlClientProvider>,
  );
}

describe('LessonProgressStatus', () => {
  afterEach(cleanup);

  it('formats the requirements line in English', () => {
    show('en');
    expect(screen.getByTestId('lesson-requirements')).toHaveTextContent(
      'Video 80% watched · Quizzes 1 of 2 passed',
    );
    expect(screen.queryByTestId('lesson-complete')).toBeNull();
  });

  it('formats the requirements line in Arabic with Eastern digits', () => {
    show('ar');
    const line = screen.getByTestId('lesson-requirements');
    expect(line.textContent).toContain('الفيديو: شاهدت ٨٠');
    expect(line.textContent).toContain('الاختبارات: اجتزت ١ من ٢');
    expect(line.textContent).not.toMatch(/[0-9]/);
  });

  it('formats the requirements line in Chinese', () => {
    show('zh');
    expect(screen.getByTestId('lesson-requirements')).toHaveTextContent(
      '视频已观看 80% · 测验已通过 1 / 2',
    );
  });

  it('leaves out what the lesson does not require', () => {
    show('en', { hasVideo: false });
    expect(screen.getByTestId('lesson-requirements')).toHaveTextContent(
      'Quizzes 1 of 2 passed',
    );
    expect(screen.getByTestId('lesson-requirements').textContent).not.toContain(
      'Video',
    );
    cleanup();
    show('en', { quizzes: { total: 0, passed: 0 } });
    expect(screen.getByTestId('lesson-requirements')).toHaveTextContent(
      /^Video 80% watched$/,
    );
    cleanup();
    show('en', { hasVideo: false, quizzes: { total: 0, passed: 0 } });
    expect(screen.queryByTestId('lesson-requirements')).toBeNull();
  });

  it('shows the seal and a link to the next lesson once complete', () => {
    show('en', { complete: true, watchedPercent: 100, nextLessonId: next });
    const done = screen.getByTestId('lesson-complete');
    expect(done).toHaveTextContent('Lesson complete');
    expect(
      screen.getByRole('img', { name: 'Completed, sealed by Mazen' }),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Next lesson' });
    expect(link).toHaveAttribute('href', `/en/learn/starter/${next}`);
    // "Primary on glaze" (deep), never the cinnabar start pill.
    expect(link.className).toContain('bg-deep');
    expect(link.className).not.toContain('bg-seal');
  });

  it('says so when it was the last lesson', () => {
    show('en', { complete: true, nextLessonId: null });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByTestId('lesson-complete')).toHaveTextContent(
      'You have finished every lesson in this level.',
    );
  });

  it('links in the reader’s locale', () => {
    show('ar', { complete: true, nextLessonId: next });
    expect(screen.getByRole('link', { name: 'الدرس التالي' })).toHaveAttribute(
      'href',
      `/ar/learn/starter/${next}`,
    );
  });
});
