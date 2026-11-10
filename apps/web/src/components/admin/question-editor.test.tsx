import { NextIntlClientProvider } from 'next-intl';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en.json';
import { QuestionEditor } from '@/components/admin/question-editor';
import { resetApiClientForTests } from '@/lib/api-client';

const navigation = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => '/en/admin/quizzes/q',
}));

function renderEditor(onSaved = vi.fn()): ReturnType<typeof vi.fn> {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QuestionEditor
        locale="en"
        quizId="00000000-0000-4000-8000-000000000001"
        onCancel={() => {}}
        onSaved={onSaved}
      />
    </NextIntlClientProvider>,
  );
  return onSaved;
}

describe('QuestionEditor', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetApiClientForTests();
  });

  it('sends correctAnswer and no options for a true/false question', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{}', {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = renderEditor();

    fireEvent.click(screen.getByLabelText('True / False'));
    expect(screen.queryByText('Add option')).toBeNull();
    fireEvent.change(
      screen.getByLabelText('English', { selector: '#q-prompt-new-en' }),
      {
        target: { value: 'The sky is blue' },
      },
    );
    fireEvent.click(screen.getByLabelText('True'));
    fireEvent.click(screen.getByRole('button', { name: 'Save question' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      '/api/v1/admin/quizzes/00000000-0000-4000-8000-000000000001/questions',
    );
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.type).toBe('TRUE_FALSE');
    expect(body.correctAnswer).toBe(true);
    expect(body.options).toEqual([]);
  });

  it('blocks a single-choice question without a correct option and shows the rule', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();
    fireEvent.change(
      screen.getByLabelText('English', { selector: '#q-prompt-new-en' }),
      {
        target: { value: 'Pick' },
      },
    );
    for (const n of [1, 2]) {
      const field = document.querySelectorAll<HTMLInputElement>(
        `[data-option-row] input[id$="-en"]`,
      )[n - 1] as HTMLInputElement;
      fireEvent.change(field, { target: { value: `Option ${n}` } });
    }
    // un-mark by switching to multiple, then clearing the only correct box
    fireEvent.click(screen.getByLabelText('Multiple choice'));
    fireEvent.click(screen.getByLabelText('Option 1 is correct'));
    fireEvent.click(screen.getByRole('button', { name: 'Save question' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A multiple-choice question needs at least one correct option.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the server 422 as a form-level error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ reason: 'invalid-options', message: 'x' }),
            { status: 422, headers: { 'content-type': 'application/json' } },
          ),
        ),
    );
    renderEditor();
    fireEvent.change(
      screen.getByLabelText('English', { selector: '#q-prompt-new-en' }),
      {
        target: { value: 'Pick' },
      },
    );
    document
      .querySelectorAll<HTMLInputElement>(`[data-option-row] input[id$="-en"]`)
      .forEach((input, i) =>
        fireEvent.change(input, { target: { value: `Option ${i + 1}` } }),
      );
    fireEvent.click(screen.getByRole('button', { name: 'Save question' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The options do not follow the rules for this question type.',
    );
  });
});
