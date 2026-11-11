// Named to run after the other specs: its sign-ups share the per-IP auth throttle.
import { readFileSync } from 'node:fs';

import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';

const webUrl = 'http://localhost:3210';
// `localhost` so the API's session cookies are shared with the browser contexts.
const apiUrl = 'http://localhost:4210';
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const slug = `m12-${runId}`;
const levelTitle = `Progress level ${runId}`;
const lessonOne = `Progress one ${runId}`;
const lessonTwo = `Progress two ${runId}`;
const quizTitle = `Progress check ${runId}`;
const right = `Right answer ${runId}`;
const wrong = `Wrong answer ${runId}`;
const fixture = process.env.E2E_VIDEO_FIXTURE ?? '';

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

async function metadataLoaded(video: Locator): Promise<void> {
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState), {
      message: 'the <video> never loaded its metadata through the stream route',
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(1);
}

/** Plays the short clip from the start to its end, like a learner who watches it. */
async function watchToTheEnd(video: Locator): Promise<void> {
  await metadataLoaded(video);
  await video.evaluate(async (node: HTMLVideoElement) => {
    node.muted = true;
    node.currentTime = 0;
    await node.play();
  });
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.ended), {
      message: 'the clip never reached its end',
      timeout: 30_000,
    })
    .toBe(true);
}

test.describe
  .serial('progress: sequence lock, completion, path, dashboard', () => {
  test.skip(!fixture, 'ffmpeg is not installed, so no MP4 fixture was made');
  test.setTimeout(180_000);

  let admin: APIRequestContext;
  let studentApi: APIRequestContext;
  let adminContext: BrowserContext;
  let studentContext: BrowserContext;
  let page: Page;
  const lessons = { one: '', two: '' };

  async function addVideo(lessonId: string): Promise<void> {
    const response = await admin.post(
      `/api/v1/admin/lessons/${lessonId}/videos/local`,
      {
        multipart: {
          // The clip is about two seconds long.
          durationSec: '2',
          file: {
            name: 'progress.mp4',
            mimeType: 'video/mp4',
            buffer: readFileSync(fixture),
          },
        },
      },
    );
    expect(response.status()).toBe(201);
  }

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
        hanzi: '进度',
        title: { en: levelTitle },
        summary: { en: 'A level that tracks progress' },
      },
    });
    expect(level.status()).toBe(201);
    const levelId = ((await level.json()) as { id: string }).id;

    for (const [key, title] of [
      ['one', lessonOne],
      ['two', lessonTwo],
    ] as const) {
      const lesson = await admin.post(
        `/api/v1/admin/levels/${levelId}/lessons`,
        { data: { title: { en: title }, hanzi: '课' } },
      );
      expect(lesson.status()).toBe(201);
      lessons[key] = ((await lesson.json()) as { id: string }).id;
      await addVideo(lessons[key]);
      expect(
        (
          await admin.post(`/api/v1/admin/lessons/${lessons[key]}/publish`)
        ).status(),
      ).toBe(200);
    }

    // Lesson one also has a quiz that must be passed.
    const quiz = await admin.post(
      `/api/v1/admin/lessons/${lessons.one}/quizzes`,
      { data: { title: { en: quizTitle } } },
    );
    expect(quiz.status()).toBe(201);
    const quizId = ((await quiz.json()) as { id: string }).id;
    expect(
      (
        await admin.post(`/api/v1/admin/quizzes/${quizId}/questions`, {
          data: {
            type: 'SINGLE',
            prompt: { en: `Pick the answer ${runId}` },
            options: [
              { text: { en: wrong }, isCorrect: false },
              { text: { en: right }, isCorrect: true },
            ],
          },
        })
      ).status(),
    ).toBe(201);
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
          email: `m12-student-${runId}@example.com`,
          password: 'safe-password-123',
          name: `Progress Learner ${runId}`,
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
    studentContext = await browser.newContext({
      baseURL: webUrl,
      storageState: await studentApi.storageState(),
    });
    page = await studentContext.newPage();
  });

  test.afterAll(async () => {
    await adminContext?.close();
    await studentContext?.close();
    await admin?.dispose();
    await studentApi?.dispose();
  });

  test('lesson two is locked until lesson one is complete', async () => {
    await open(page, `/ar/learn/${slug}/${lessons.two}`, () =>
      expect(page.getByTestId('lesson-gate')).toBeVisible({ timeout: 3000 }),
    );
    const gate = page.getByTestId('lesson-gate');
    await expect(
      gate.getByRole('heading', { name: `أنهِ «${lessonOne}» أولاً` }),
    ).toBeVisible();
    await expect(
      gate.getByRole('link', { name: 'اذهب إلى ذلك الدرس' }),
    ).toHaveAttribute('href', `/ar/learn/${slug}/${lessons.one}`);
    await expect(page.getByTestId('lesson-video')).toHaveCount(0);

    // The API says the same, it is not only the page.
    const status = await page.evaluate(async (id) => {
      const response = await fetch(`/api/v1/lessons/${id}/playback`);
      return { status: response.status, body: await response.json() };
    }, lessons.two);
    expect(status.status).toBe(403);
    expect(status.body).toMatchObject({
      reason: 'sequence-locked',
      requiredLessonId: lessons.one,
    });
  });

  test('watching lesson one and passing its quiz completes it and opens lesson two', async () => {
    await open(page, `/ar/learn/${slug}/${lessons.one}`, () =>
      expect(page.getByTestId('lesson-video')).toBeVisible({ timeout: 3000 }),
    );
    const requirements = page.getByTestId('lesson-requirements');
    await expect(requirements).toContainText('الفيديو: شاهدت ٠');
    await expect(requirements).toContainText('الاختبارات: اجتزت ٠ من ١');
    await expect(page.getByTestId('lesson-complete')).toHaveCount(0);

    // The path shows lesson one as the next lesson and lesson two unfired.
    const path = page.getByRole('list', { name: 'دروس هذا المستوى' });
    await expect(path.locator('[data-path-row]').nth(0)).toContainText(
      'يُعرض الآن',
    );
    await expect(path.locator('[data-path-row]').nth(1)).toContainText('مغلق');

    // Playing the whole clip reports the watched seconds on its own.
    await watchToTheEnd(page.getByTestId('lesson-video'));
    await expect(requirements).toContainText('شاهدت ١٠٠', { timeout: 20_000 });
    // The quiz is still open, so the lesson is not complete yet.
    await expect(requirements).toContainText('اجتزت ٠ من ١');
    await expect(page.getByTestId('lesson-complete')).toHaveCount(0);

    // Pass the quiz.
    await page
      .getByTestId('quiz-row')
      .getByRole('link', { name: /ابدأ/ })
      .click();
    await expect(page).toHaveURL(/\/quiz\/[0-9a-f-]{36}$/);
    await page.getByText(right, { exact: true }).click();
    await page.getByRole('button', { name: 'أرسل الإجابات' }).click();
    await expect(page.getByTestId('attempt-result')).toContainText('نجحت');
    await page.getByRole('link', { name: 'العودة إلى الدرس' }).last().click();

    // Both requirements are met: "Lesson complete", the seal, the next pill.
    const complete = page.getByTestId('lesson-complete');
    await expect(complete).toBeVisible();
    await expect(complete).toContainText('اكتمل الدرس');
    await expect(
      complete.getByRole('img', { name: 'مكتمل، بختم مازن' }),
    ).toBeVisible();
    await expect(page.getByTestId('lesson-requirements')).toContainText(
      'اجتزت ١ من ١',
    );
    await complete.getByRole('link', { name: 'الدرس التالي' }).click();

    await expect(page).toHaveURL(`/ar/learn/${slug}/${lessons.two}`);
    await expect(
      page.getByRole('heading', { name: lessonTwo, level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId('lesson-gate')).toHaveCount(0);
    await metadataLoaded(page.getByTestId('lesson-video'));
    // Lesson two has a video and no quiz: the line shows the video only.
    await expect(page.getByTestId('lesson-requirements')).toContainText(
      'الفيديو: شاهدت ٠',
    );
    await expect(page.getByTestId('lesson-requirements')).not.toContainText(
      'الاختبارات',
    );
  });

  test('the level page shows ١ of ٢ with the right path and bar states', async () => {
    await open(page, `/ar/levels/${slug}`, () =>
      expect(page.getByTestId('level-progress')).toBeVisible({ timeout: 3000 }),
    );
    await expect(page.getByTestId('level-progress')).toContainText(
      'أكملت ١ من ٢',
    );
    const bar = page.getByRole('list', { name: 'تقدّمك في هذا المستوى' });
    const states = bar.getByRole('listitem');
    await expect(states).toHaveCount(2);
    await expect(states.nth(0)).toHaveAttribute('data-state', 'done');
    await expect(states.nth(1)).toHaveAttribute('data-state', 'next');

    const rows = page
      .getByRole('list', { name: 'دروس هذا المستوى' })
      .locator('[data-path-row]');
    await expect(rows.nth(0)).toContainText('مكتمل');
    await expect(
      rows.nth(0).getByRole('img', { name: /بختم مازن/ }),
    ).toBeVisible();
    await expect(rows.nth(1)).toContainText('التالي');
    // Exactly one next row on the path.
    await expect(rows.filter({ hasText: 'ابدأ' })).toHaveCount(1);
  });

  test('the dashboard offers Continue, then Level complete after lesson two', async () => {
    await open(page, '/ar/dashboard', () =>
      expect(page.getByTestId('continue-lesson')).toBeVisible({
        timeout: 3000,
      }),
    );
    await expect(page.getByTestId('level-count')).toContainText('أكملت ١ من ٢');
    const next = page.getByTestId('continue-lesson');
    await expect(next).toContainText(`تابع: ${lessonTwo}`);
    await expect(next).toHaveAttribute(
      'href',
      `/ar/learn/${slug}/${lessons.two}`,
    );

    // Finish lesson two (a video only).
    await next.click();
    await expect(page).toHaveURL(`/ar/learn/${slug}/${lessons.two}`);
    await watchToTheEnd(page.getByTestId('lesson-video'));
    const complete = page.getByTestId('lesson-complete');
    await expect(complete).toBeVisible({ timeout: 20_000 });
    await expect(complete).toContainText('أنهيت كل دروس هذا المستوى.');
    await expect(complete.getByRole('link')).toHaveCount(0);

    await open(page, '/ar/dashboard', () =>
      expect(page.getByTestId('level-complete')).toBeVisible({ timeout: 3000 }),
    );
    await expect(page.getByTestId('level-complete')).toContainText(
      'اكتمل المستوى',
    );
    await expect(page.getByTestId('continue-lesson')).toHaveCount(0);
    await expect(page.getByTestId('level-count')).toContainText('أكملت ٢ من ٢');
  });
});
