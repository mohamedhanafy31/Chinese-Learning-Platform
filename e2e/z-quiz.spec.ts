// Named to run after the other specs: its sign-ups share the per-IP auth throttle.
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const webUrl = 'http://localhost:3210';
// `localhost` so the API's session cookies are shared with the browser contexts.
const apiUrl = 'http://localhost:4210';
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const slug = `m9-${runId}`;
const lessonName = `Quiz lesson ${runId}`;
const quizTitle = `Greetings check ${runId}`;
const explanation = `Nǐ hǎo is hello ${runId}`;

const q1 = {
  prompt: `How do you greet? ${runId}`,
  right: `S-right ${runId}`,
  wrong: `S-wrong ${runId}`,
};
const q2 = {
  prompt: `Pick the greetings ${runId}`,
  a: `M-a ${runId}`,
  b: `M-b ${runId}`,
  c: `M-c ${runId}`,
};
const q3 = { prompt: `Mazen teaches Chinese ${runId}` };

async function withRetry<T extends { status(): number }>(
  action: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await action();
    if (response.status() !== 429 || attempt >= 8) return response;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

/** Opens a page, retrying while the shared-IP throttle answers 429. */
async function open(page: Page, path: string, ready: () => Promise<void>) {
  await expect(async () => {
    await page.goto(path);
    await ready();
  }).toPass({ timeout: 90_000, intervals: [1000, 5000, 10_000] });
}

test.describe.serial('quizzes: build, take, review, history', () => {
  test.setTimeout(180_000);

  let admin: APIRequestContext;
  let studentApi: APIRequestContext;
  let adminContext: BrowserContext;
  let studentContext: BrowserContext;
  let anonymousContext: BrowserContext;
  let adminPage: Page;
  let studentPage: Page;
  let lessonId = '';
  let quizPath = '';

  test.beforeAll(async ({ browser }) => {
    // Sign-ups can meet the shared-IP throttle and wait it out.
    test.setTimeout(150_000);
    admin = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { origin: webUrl },
    });
    const login = await withRetry(() =>
      admin.post('/api/v1/auth/login', {
        data: {
          email: process.env.E2E_ADMIN_EMAIL ?? '',
          password: process.env.E2E_ADMIN_PASSWORD ?? '',
        },
      }),
    );
    expect(login.status()).toBe(200);

    const level = await admin.post('/api/v1/admin/levels', {
      data: {
        slug,
        hanzi: '问候',
        title: { en: `Quiz level ${runId}` },
        summary: { en: 'A level with a quiz' },
      },
    });
    expect(level.status()).toBe(201);
    const levelId = ((await level.json()) as { id: string }).id;
    const lesson = await admin.post(`/api/v1/admin/levels/${levelId}/lessons`, {
      data: { title: { en: lessonName }, isFreePreview: true },
    });
    expect(lesson.status()).toBe(201);
    lessonId = ((await lesson.json()) as { id: string }).id;
    expect(
      (await admin.post(`/api/v1/admin/lessons/${lessonId}/publish`)).status(),
    ).toBe(200);
    expect(
      (await admin.post(`/api/v1/admin/levels/${levelId}/publish`)).status(),
    ).toBe(200);

    studentApi = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { origin: webUrl },
    });
    const registered = await withRetry(() =>
      studentApi.post('/api/v1/auth/register', {
        data: {
          email: `m9-student-${runId}@example.com`,
          password: 'safe-password-123',
          name: `Quiz Learner ${runId}`,
          phone: '01001234567',
        },
      }),
    );
    expect(registered.status()).toBe(201);
    const studentId = ((await registered.json()) as { user: { id: string } })
      .user.id;
    expect(
      (
        await admin.post(`/api/v1/admin/students/${studentId}/enrollments`, {
          data: { levelId },
        })
      ).status(),
    ).toBe(201);

    adminContext = await browser.newContext({
      baseURL: webUrl,
      storageState: await admin.storageState(),
    });
    adminPage = await adminContext.newPage();
    studentContext = await browser.newContext({
      baseURL: webUrl,
      storageState: await studentApi.storageState(),
    });
    studentPage = await studentContext.newPage();
    anonymousContext = await browser.newContext({ baseURL: webUrl });
  });

  test.afterAll(async () => {
    await adminContext?.close();
    await studentContext?.close();
    await anonymousContext?.close();
    await admin?.dispose();
    await studentApi?.dispose();
  });

  test('admin builds a quiz with three question types and reorders', async () => {
    const page = adminPage;
    await open(page, `/en/admin/lessons/${lessonId}`, () =>
      expect(page.getByTestId('quizzes-panel')).toBeVisible({ timeout: 3000 }),
    );
    const panel = page.getByTestId('quizzes-panel');
    await expect(panel.getByText('No quizzes yet.')).toBeVisible();
    await panel.getByRole('button', { name: 'New quiz' }).click();
    await panel.locator('#quiz-title-new-en').fill(quizTitle);
    await expect(panel.locator('#quiz-pass-new')).toHaveValue('70');
    await panel.getByRole('button', { name: 'Create quiz' }).click();
    await expect(page).toHaveURL(/\/en\/admin\/quizzes\/[0-9a-f-]{36}$/);
    quizPath = new URL(page.url()).pathname;
    await expect(
      page.getByRole('heading', { name: quizTitle, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText('No questions yet. Add the first one.'),
    ).toBeVisible();

    const option = (index: number) =>
      page.locator('[data-option-row]').nth(index).getByLabel('English');

    // 1. single choice, with an explanation
    await page.getByRole('button', { name: 'Add question' }).click();
    await page.locator('#q-prompt-new-en').fill(q1.prompt);
    await option(0).fill(q1.wrong);
    await option(1).fill(q1.right);
    await page.getByLabel('Option 2 is correct').check();
    await page.locator('#q-expl-new-en').fill(explanation);
    await page.getByRole('button', { name: 'Save question' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Question saved.' }),
    ).toBeVisible();

    // 2. multiple choice: A and C are correct
    await page.getByRole('button', { name: 'Add question' }).click();
    await page.getByText('Multiple choice', { exact: true }).click();
    await page.locator('#q-prompt-new-en').fill(q2.prompt);
    await page.getByRole('button', { name: 'Add option' }).click();
    await option(0).fill(q2.a);
    await option(1).fill(q2.b);
    await option(2).fill(q2.c);
    await page.getByLabel('Option 1 is correct').check();
    await page.getByLabel('Option 3 is correct').check();
    await page.getByRole('button', { name: 'Save question' }).click();
    await expect(
      page.getByTestId('questions-list').locator('[data-question-row]'),
    ).toHaveCount(2);

    // 3. true / false: True is correct
    await page.getByRole('button', { name: 'Add question' }).click();
    await page.getByText('True / False', { exact: true }).click();
    await page.locator('#q-prompt-new-en').fill(q3.prompt);
    await page.getByText('True', { exact: true }).click();
    await page.getByRole('button', { name: 'Save question' }).click();
    const rows = page
      .getByTestId('questions-list')
      .locator('[data-question-row]');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(2)).toContainText('True / False');
    await expect(rows.nth(2)).toContainText('Correct: True');
    await expect(rows.nth(1)).toContainText(`Correct: ${q2.a} · ${q2.c}`);

    // reorder: the true/false question moves up one place
    await rows
      .nth(2)
      .getByRole('button', { name: 'Move question 3 up' })
      .click();
    await expect(rows.nth(1)).toContainText(q3.prompt);
    await expect(rows.nth(2)).toContainText(q2.prompt);
    await page.reload();
    await expect(rows.nth(1)).toContainText(q3.prompt);
    // put it back so the student sees single, multiple, true/false
    await rows
      .nth(1)
      .getByRole('button', { name: 'Move question 2 down' })
      .click();
    await expect(rows.nth(1)).toContainText(q2.prompt);
    await expect(rows.nth(2)).toContainText(q3.prompt);

    // the lesson page lists the quiz
    await page.goto(`/en/admin/lessons/${lessonId}`);
    await expect(page.getByTestId('quizzes-panel')).toContainText(quizTitle);
    await expect(page.getByTestId('quizzes-panel')).toContainText(
      '3 questions',
    );
  });

  test('enrolled student takes the quiz in Arabic: not yet, review, then passed', async () => {
    const page = studentPage;
    const lessonUrl = `/ar/learn/${slug}/${lessonId}`;
    await open(page, lessonUrl, () =>
      expect(page.getByRole('heading', { name: 'اختبر فهمك' })).toBeVisible({
        timeout: 3000,
      }),
    );
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const row = page.getByTestId('quiz-row');
    await expect(row).toContainText(quizTitle);
    await expect(row).toContainText('٣ أسئلة');
    await expect(row).toContainText('درجة النجاح ٧٠٪');
    await expect(row.getByTestId('quiz-state')).toHaveText('لم يُحلّ بعد');
    await row.getByRole('link', { name: /ابدأ/ }).click();
    await expect(page).toHaveURL(new RegExp(`/quiz/[0-9a-f-]{36}$`));

    const submit = page.getByRole('button', { name: 'أرسل الإجابات' });
    await expect(page.getByTestId('answered-count')).toHaveText(
      'أجبتَ عن ٠ من ٣',
    );
    await expect(submit).toBeDisabled();

    // first attempt: the single-choice question is answered wrongly
    await page.getByText(q1.wrong, { exact: true }).click();
    await page.getByText(q2.a, { exact: true }).click();
    await page.getByText(q2.c, { exact: true }).click();
    await expect(page.getByTestId('answered-count')).toHaveText(
      'أجبتَ عن ٢ من ٣',
    );
    await page.getByText('صح', { exact: true }).click();
    await expect(page.getByTestId('answered-count')).toHaveText(
      'أجبتَ عن ٣ من ٣',
    );
    await expect(submit).toBeEnabled();
    await submit.click();

    const result = page.getByTestId('attempt-result');
    await expect(result).toBeVisible();
    await expect(
      result.getByRole('heading', { level: 2 }).first(),
    ).toContainText('٦٦٪');
    await expect(
      result.getByRole('heading', { level: 2 }).first(),
    ).toContainText(/[٠-٩]/);
    await expect(result).toContainText('لم تنجح بعد: درجة النجاح ٧٠٪');
    await expect(page.getByTestId('pass-seal')).toHaveCount(0);
    const review = result.getByTestId('review-question');
    await expect(review.nth(0)).toContainText('ليست صحيحة تماماً');
    await expect(review.nth(0)).toContainText('إجابتك');
    await expect(review.nth(0)).toContainText('الإجابة الصحيحة');
    await expect(review.nth(0)).toContainText(explanation);
    await expect(review.nth(1)).toContainText('إجابة صحيحة');

    // try again and answer everything correctly
    await page.getByRole('button', { name: 'حاول مجدداً' }).click();
    await expect(page.getByTestId('answered-count')).toHaveText(
      'أجبتَ عن ٠ من ٣',
    );
    await page.getByText(q1.right, { exact: true }).click();
    await page.getByText(q2.a, { exact: true }).click();
    await page.getByText(q2.c, { exact: true }).click();
    await page.getByText('صح', { exact: true }).click();
    await page.getByRole('button', { name: 'أرسل الإجابات' }).click();
    await expect(
      page
        .getByTestId('attempt-result')
        .getByRole('heading', { level: 2 })
        .first(),
    ).toContainText('١٠٠٪');
    await expect(page.getByRole('img', { name: 'بختم مازن' })).toBeVisible();
    await expect(page.getByTestId('attempt-result')).toContainText('نجحت');

    // the lesson's list shows Passed
    await page.getByRole('link', { name: 'العودة إلى الدرس' }).last().click();
    await expect(page.getByTestId('quiz-state')).toContainText('ناجح · ١٠٠٪');
    await expect(page.getByTestId('quiz-row').getByRole('link')).toContainText(
      'حاول مجدداً',
    );

    // history lists both attempts, newest first; the older one opens
    quizPath = new URL(
      (await page
        .getByTestId('quiz-row')
        .getByRole('link')
        .getAttribute('href')) ?? '',
      webUrl,
    ).pathname;
    await page.goto(quizPath);
    const history = page.getByTestId('attempt-history').getByRole('link');
    await expect(history).toHaveCount(2);
    await expect(history.nth(0)).toContainText('ناجح');
    await expect(history.nth(0)).toContainText('١٠٠٪');
    await expect(history.nth(1)).toContainText('٦٦٪');
    await history.nth(1).click();
    await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('attempt-result')).toContainText(
      'لم تنجح بعد: درجة النجاح ٧٠٪',
    );
    await expect(page.getByTestId('attempt-result')).toContainText(explanation);
    await expect(page.getByTestId('pass-seal')).toHaveCount(0);
  });

  test('anonymous visitor sees the quiz list on a free preview and is sent to login', async () => {
    const page = await anonymousContext.newPage();
    await open(page, `/ar/learn/${slug}/${lessonId}`, () =>
      expect(page.getByRole('heading', { name: 'اختبر فهمك' })).toBeVisible({
        timeout: 3000,
      }),
    );
    const row = page.getByTestId('quiz-row');
    await expect(row).toContainText(quizTitle);
    await row.getByRole('link', { name: /ابدأ/ }).click();
    await expect(page).toHaveURL(/\/ar\/login\?next=/);
    expect(
      decodeURIComponent(new URL(page.url()).searchParams.get('next') ?? ''),
    ).toMatch(new RegExp(`/ar/learn/${slug}/${lessonId}/quiz/[0-9a-f-]{36}$`));
  });
});
