import { NextIntlClientProvider } from 'next-intl';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LearnerQuiz } from '@app/shared';

import messages from '../../../messages/en.json';
import { AttemptResult } from '@/components/quiz/attempt-result';
import { OptionRow } from '@/components/quiz/option-row';
import { QuizSheet } from '@/components/quiz/quiz-sheet';
import { resetApiClientForTests } from '@/lib/api-client';
import type { ReviewModel } from '@/lib/quiz-review';

const navigation = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

const id = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const quiz: LearnerQuiz = {
  id: id(1),
  lessonId: id(2),
  title: { en: 'Greetings' },
  description: null,
  passingScore: 70,
  questionCount: 2,
  totalPoints: 2,
  questions: [
    {
      id: id(10),
      type: 'SINGLE',
      prompt: { en: 'How do you say hello?' },
      hanzi: '你好',
      image: null,
      points: 1,
      options: [
        { id: id(11), text: { en: 'Nǐ hǎo' } },
        { id: id(12), text: { en: 'Zàijiàn' } },
      ],
    },
    {
      id: id(20),
      type: 'MULTIPLE',
      prompt: { en: 'Pick the greetings' },
      hanzi: null,
      image: null,
      points: 1,
      options: [
        { id: id(21), text: { en: 'Nǐ hǎo' } },
        { id: id(22), text: { en: 'Xièxie' } },
        { id: id(23), text: { en: 'Nín hǎo' } },
      ],
    },
  ],
};

function renderSheet(nextLessonHref: string | null = null): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QuizSheet
        quiz={quiz}
        lessonHref="/en/learn/x/y"
        nextLessonHref={nextLessonHref}
        levelHref="/en/levels/x"
        loginHref="/en/login"
      />
    </NextIntlClientProvider>,
  );
}

function wrap(node: React.ReactNode): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe('OptionRow', () => {
  afterEach(cleanup);

  it('is a native radio for single choice and a checkbox for multiple', () => {
    wrap(
      <>
        <OptionRow
          type="SINGLE"
          id="a"
          name="q1"
          text="One"
          checked={false}
          onChange={() => {}}
        />
        <OptionRow
          type="TRUE_FALSE"
          id="b"
          name="q2"
          text="True"
          checked
          onChange={() => {}}
        />
        <OptionRow
          type="MULTIPLE"
          id="c"
          name="q3"
          text="Many"
          checked={false}
          onChange={() => {}}
        />
      </>,
    );
    expect(screen.getByLabelText('One')).toHaveAttribute('type', 'radio');
    expect(screen.getByLabelText('True')).toHaveAttribute('type', 'radio');
    expect(screen.getByLabelText('Many')).toHaveAttribute('type', 'checkbox');
  });

  it('shows selection with more than colour and stays keyboard-focusable', () => {
    wrap(
      <OptionRow
        type="MULTIPLE"
        id="c"
        name="q"
        text="Many"
        checked
        onChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Many');
    expect(input).toBeChecked();
    const row = input.closest('label') as HTMLElement;
    // a 2px deep border plus a check glyph inside the square indicator
    expect(row.className).toContain('border-2');
    const indicator = row.querySelector(
      '[data-indicator="square"]',
    ) as HTMLElement;
    expect(indicator).toHaveAttribute('data-selected', 'true');
    expect(indicator.querySelector('svg')).not.toBeNull();
    // visually hidden, not display:none or disabled, so it still takes focus
    expect(input.className).toContain('sr-only');
    input.focus();
    expect(input).toHaveFocus();
  });

  it('toggles on click, which is what Space does on a focused checkbox', () => {
    const onChange = vi.fn();
    wrap(
      <OptionRow
        type="MULTIPLE"
        id="c"
        name="q"
        text="Many"
        checked={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Many'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('QuizSheet', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    resetApiClientForTests();
  });

  it('counts answers and keeps submit disabled until all are answered', () => {
    renderSheet();
    const submit = screen.getByRole('button', { name: 'Submit answers' });
    expect(screen.getByTestId('answered-count')).toHaveTextContent(
      'Answered 0 of 2',
    );
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Zàijiàn'));
    expect(screen.getByTestId('answered-count')).toHaveTextContent(
      'Answered 1 of 2',
    );
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getAllByLabelText('Nǐ hǎo')[1] as HTMLElement);
    expect(screen.getByTestId('answered-count')).toHaveTextContent(
      'Answered 2 of 2',
    );
    expect(submit).toBeEnabled();

    // unticking the only multiple choice makes the question unanswered again
    fireEvent.click(screen.getAllByLabelText('Nǐ hǎo')[1] as HTMLElement);
    expect(submit).toBeDisabled();
  });

  it('labels groups with a fieldset legend and says when several apply', () => {
    renderSheet();
    expect(screen.getAllByRole('group')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Nǐ hǎo' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Nǐ hǎo' })).toBeVisible();
    expect(screen.getByText('Question 1 of 2')).toBeVisible();
    expect(screen.getByText('Choose all that apply')).toBeVisible();
    expect(screen.getByText('你好')).toHaveAttribute('lang', 'zh');
  });

  it('restores an in-progress draft from sessionStorage', async () => {
    window.sessionStorage.setItem(
      `quiz-draft:${quiz.id}`,
      JSON.stringify({
        [id(10)]: [id(12)],
        [id(20)]: [id(21), id(99)],
        [id(77)]: [id(1)],
      }),
    );
    renderSheet();
    await waitFor(() => expect(screen.getByLabelText('Zàijiàn')).toBeChecked());
    expect(screen.getAllByLabelText('Nǐ hǎo')[1]).toBeChecked();
    expect(screen.getByTestId('answered-count')).toHaveTextContent(
      'Answered 2 of 2',
    );
  });

  it('still works when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    renderSheet();
    fireEvent.click(screen.getByLabelText('Zàijiàn'));
    expect(screen.getByLabelText('Zàijiàn')).toBeChecked();
  });

  it('maps a 400 issues array onto the affected questions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'Invalid answers',
            issues: [{ questionId: id(20), message: 'Unknown option' }],
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    renderSheet();
    fireEvent.click(
      screen.getByLabelText('Nǐ hǎo', { selector: `#opt-${id(11)}` }),
    );
    fireEvent.click(document.getElementById(`opt-${id(21)}`) as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Submit answers' }));

    expect(
      await screen.findByText('Choose an answer for this question.'),
    ).toBeVisible();
    const groups = screen.getAllByRole('group');
    expect(groups[1]).toHaveAttribute('aria-invalid', 'true');
    expect(groups[0]).not.toHaveAttribute('aria-invalid');
    // the draft survives a failed submit
    expect(
      window.sessionStorage.getItem(`quiz-draft:${quiz.id}`),
    ).not.toBeNull();
  });

  it('shows the rate-limit error as a form-level alert on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 429 })),
    );
    renderSheet();
    fireEvent.click(document.getElementById(`opt-${id(11)}`) as HTMLElement);
    fireEvent.click(document.getElementById(`opt-${id(21)}`) as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts — wait a minute and try again.',
    );
  });

  it('submits once, shows the review, and clears the draft', async () => {
    const response = {
      attempt: {
        id: id(50),
        score: 50,
        earnedPoints: 1,
        totalPoints: 2,
        passed: false,
        createdAt: '2026-01-01T10:00:00.000Z',
      },
      results: [
        {
          questionId: id(10),
          correct: false,
          chosen: [id(12)],
        },
        {
          questionId: id(20),
          correct: true,
          chosen: [id(21)],
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderSheet();
    fireEvent.click(document.getElementById(`opt-${id(12)}`) as HTMLElement);
    fireEvent.click(document.getElementById(`opt-${id(21)}`) as HTMLElement);
    const submit = screen.getByRole('button', { name: 'Submit answers' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(await screen.findByTestId('attempt-result')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(`quiz-draft:${quiz.id}`)).toBeNull();
    expect(screen.getByText('Not yet: the pass mark is 70%')).toBeVisible();
    expect(screen.queryByTestId('pass-seal')).toBeNull();
    expect(screen.getByRole('heading', { name: /Your result/ })).toHaveFocus();
    expect(
      screen.getByText('Pass the quiz to see the correct answers.'),
    ).toBeVisible();
    expect(screen.queryByText('Correct answer')).toBeNull();
    expect(screen.queryByText('Nǐ hǎo means hello.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByTestId('answered-count')).toHaveTextContent(
      'Answered 0 of 2',
    );
  });

  it('offers a forward action after passing and keeps retry secondary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            attempt: {
              id: id(51),
              score: 100,
              earnedPoints: 2,
              totalPoints: 2,
              passed: true,
              createdAt: '2026-01-01T10:00:00.000Z',
            },
            results: quiz.questions.map((question) => ({
              questionId: question.id,
              correct: true,
              chosen: question.options.map((option) => option.id),
              correctOptionIds: question.options.map((option) => option.id),
              explanation: null,
            })),
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    renderSheet('/en/learn/x/next');
    fireEvent.click(document.getElementById(`opt-${id(11)}`) as HTMLElement);
    fireEvent.click(document.getElementById(`opt-${id(21)}`) as HTMLElement);
    fireEvent.click(document.getElementById(`opt-${id(22)}`) as HTMLElement);
    fireEvent.click(document.getElementById(`opt-${id(23)}`) as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Submit answers' }));

    const forward = await screen.findByRole('link', { name: 'Next lesson' });
    expect(forward).toHaveAttribute('href', '/en/learn/x/next');
    expect(
      screen.getByRole('link', { name: 'Back to the lesson' }),
    ).toHaveAttribute('href', '/en/learn/x/y');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

const review = (passed: boolean): ReviewModel => ({
  attemptId: id(50),
  score: passed ? 100 : 50,
  earnedPoints: passed ? 2 : 1,
  totalPoints: 2,
  passed,
  passingScore: 70,
  questions: [
    {
      id: id(10),
      type: 'SINGLE',
      prompt: { en: 'How do you say hello?' },
      hanzi: null,
      image: null,
      ...(passed ? { explanation: { en: 'Nǐ hǎo means hello.' } } : {}),
      correct: passed,
      chosen: [id(passed ? 11 : 12)],
      options: [
        {
          id: id(11),
          text: { en: 'Nǐ hǎo' },
          ...(passed ? { isCorrect: true } : {}),
        },
        {
          id: id(12),
          text: { en: 'Zàijiàn' },
          ...(passed ? { isCorrect: false } : {}),
        },
      ],
    },
  ],
});

describe('AttemptResult review', () => {
  afterEach(cleanup);

  it('keeps correct options and explanations hidden after a failed attempt', () => {
    wrap(<AttemptResult model={review(false)} />);
    expect(screen.getByText('Not quite')).toBeVisible();
    expect(
      screen.getByText('Pass the quiz to see the correct answers.'),
    ).toBeVisible();
    expect(screen.queryByText('Correct answer')).toBeNull();
    expect(screen.queryByText('Nǐ hǎo means hello.')).toBeNull();
    const selectedRow = screen.getByText('Zàijiàn').closest('li');
    expect(selectedRow).toHaveAttribute('data-chosen', 'true');
    expect(screen.queryByTestId('pass-seal')).toBeNull();
  });

  it('stamps the named seal only when passed', () => {
    wrap(<AttemptResult model={review(true)} />);
    expect(screen.getByText('Correct')).toBeVisible();
    expect(screen.getByText('Passed (pass mark 70%)')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Sealed by Mazen' })).toBeVisible();
    expect(screen.getByTestId('pass-seal')).toHaveAttribute(
      'data-reveal',
      'seal',
    );
    const correct = screen
      .getAllByRole('listitem')
      .find((li) => li.dataset.marker === 'correct');
    expect(correct?.textContent?.indexOf('Correct answer')).toBeLessThan(
      correct?.textContent?.indexOf('Nǐ hǎo') ?? 0,
    );
    expect(screen.getByText('Nǐ hǎo means hello.')).toBeVisible();
  });
});
