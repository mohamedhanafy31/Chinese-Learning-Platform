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
import {
  archivePublishableContent,
  makeLessonPublishable,
} from './publishable-content';

const webUrl = 'http://localhost:3210';
// `localhost` (not 127.0.0.1) so the session cookies the API sets are shared
// with the browser contexts below, and with the direct-to-API video upload.
const apiUrl = 'http://localhost:4210';
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const slug = `m6-${runId}`;
const levelTitle = `Video level ${runId}`;
const lessonAlpha = `Alpha video ${runId}`;
const lessonBeta = `Beta video ${runId}`;
const lessonGamma = `Gamma video ${runId}`;
const fixture = process.env.E2E_VIDEO_FIXTURE ?? '';

async function metadataLoaded(video: Locator): Promise<void> {
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState), {
      message: 'the <video> never loaded its metadata through the stream route',
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(1);
}

/** Retries a call that may meet the shared-IP throttle (429). */
async function withRetry<T extends { status(): number }>(
  action: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await action();
    if (response.status() !== 429 || attempt >= 8) return response;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

test.describe
  .serial('lesson video: upload, public preview, gated lessons', () => {
  test.skip(!fixture, 'ffmpeg is not installed, so no MP4 fixture was made');
  test.setTimeout(180_000);

  let admin: APIRequestContext;
  let studentApi: APIRequestContext;
  let adminContext: BrowserContext;
  let studentContext: BrowserContext;
  let adminPage: Page;
  let studentPage: Page;
  let levelId = '';
  const lessons: Record<'alpha' | 'beta' | 'gamma', string> = {
    alpha: '',
    beta: '',
    gamma: '',
  };

  const mp4 = (): Buffer => readFileSync(fixture);

  async function uploadViaApi(lessonId: string): Promise<void> {
    const response = await admin.post(
      `/api/v1/admin/lessons/${lessonId}/videos/local`,
      {
        multipart: {
          durationSec: '2',
          file: { name: 'api.mp4', mimeType: 'video/mp4', buffer: mp4() },
        },
      },
    );
    expect(response.status()).toBe(201);
  }

  test.beforeAll(async ({ browser }) => {
    admin = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { origin: webUrl },
    });
    const login = await withRetry(() =>
      admin.post('/api/v1/auth/admin/login', {
        data: {
          email: process.env.E2E_ADMIN_EMAIL ?? '',
          password: process.env.E2E_ADMIN_PASSWORD ?? '',
        },
      }),
    );
    expect(login.status()).toBe(200);

    const created = await admin.post('/api/v1/admin/levels', {
      data: {
        slug,
        hanzi: '视频',
        title: { en: levelTitle },
        summary: { en: 'A level with video lessons' },
      },
    });
    expect(created.status()).toBe(201);
    levelId = ((await created.json()) as { id: string }).id;

    for (const [key, title, free] of [
      ['alpha', lessonAlpha, true],
      ['beta', lessonBeta, false],
      ['gamma', lessonGamma, false],
    ] as const) {
      const lesson = await admin.post(
        `/api/v1/admin/levels/${levelId}/lessons`,
        {
          data: {
            title: { en: title },
            hanzi: '课',
            description: { en: `About ${title}` },
            isFreePreview: free,
          },
        },
      );
      expect(lesson.status()).toBe(201);
      lessons[key] = ((await lesson.json()) as { id: string }).id;
      const quizId = await makeLessonPublishable(admin, lessons[key]);
      expect(
        (
          await admin.post(`/api/v1/admin/lessons/${lessons[key]}/publish`)
        ).status(),
      ).toBe(200);
      await archivePublishableContent(admin, quizId);
    }
    expect(
      (await admin.post(`/api/v1/admin/levels/${levelId}/publish`)).status(),
    ).toBe(200);

    // The API's own session cookies (domain localhost) sign the browser in.
    adminContext = await browser.newContext({
      baseURL: webUrl,
      storageState: await admin.storageState(),
    });
    adminPage = await adminContext.newPage();

    studentApi = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { origin: webUrl },
    });
    const registered = await withRetry(() =>
      studentApi.post('/api/v1/auth/register', {
        data: {
          email: `m6-student-${runId}@example.com`,
          password: 'safe-password-123',
          name: `Video Learner ${runId}`,
          phone: '01001234567',
        },
      }),
    );
    expect(registered.status()).toBe(201);
    studentContext = await browser.newContext({
      baseURL: webUrl,
      storageState: await studentApi.storageState(),
    });
    studentPage = await studentContext.newPage();
  });

  test.afterAll(async () => {
    await adminContext?.close();
    await studentContext?.close();
    await admin?.dispose();
    await studentApi?.dispose();
  });

  test('admin uploads a video with real progress, then previews it', async () => {
    await adminPage.goto(`/en/admin/lessons/${lessons.alpha}`);
    const panel = adminPage.getByTestId('video-panel');
    await expect(panel.getByRole('heading', { name: 'Video' })).toBeVisible();
    await expect(panel.getByTestId('video-dev-notice')).toHaveCount(0);
    await expect(panel.getByTestId('video-empty')).toBeVisible();

    await panel.getByLabel('Video file').setInputFiles(fixture);

    const bar = panel.getByRole('progressbar');
    await expect(bar).toHaveAttribute('aria-valuenow', '100');
    await expect(
      panel.getByRole('status').filter({ hasText: 'Video uploaded.' }),
    ).toBeVisible();

    const details = panel.getByTestId('video-details');
    await expect(details).toContainText(/0:0[1-3]/);

    const preview = panel.getByTestId('video-preview');
    await expect(preview).toBeVisible();
    await metadataLoaded(preview);
    await expect(panel.getByTestId('video-empty')).toHaveCount(0);
  });

  test('admin removes a video after confirming in a dialog', async () => {
    await uploadViaApi(lessons.gamma);
    await adminPage.goto(`/en/admin/lessons/${lessons.gamma}`);
    const panel = adminPage.getByTestId('video-panel');
    await expect(panel.getByTestId('video-details')).toBeVisible();

    await panel.getByRole('button', { name: 'Remove video' }).click();
    const dialog = adminPage.getByRole('dialog', {
      name: 'Remove this video?',
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep video' }).click();
    await expect(dialog).toBeHidden();
    await expect(panel.getByTestId('video-details')).toBeVisible();

    await panel.getByRole('button', { name: 'Remove video' }).click();
    await dialog.getByRole('button', { name: 'Remove video' }).click();
    await expect(dialog).toBeHidden();
    await expect(panel.getByTestId('video-empty')).toBeVisible();
    await expect(panel.getByTestId('video-details')).toHaveCount(0);
  });

  test('an anonymous visitor plays the free preview lesson', async ({
    page,
  }) => {
    await uploadViaApi(lessons.beta);

    // The level page links open and free lessons, never locked ones. The
    // public catalog is cached for up to a minute, so retry until it shows.
    await expect(async () => {
      await page.goto(`/en/levels/${slug}`);
      await expect(
        page.getByRole('heading', { name: levelTitle, level: 1 }),
      ).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 90_000, intervals: [1000, 5000, 10_000] });
    const rows = page.getByRole('list', { name: 'Lessons in this level' });
    await expect(
      rows.getByRole('link', { name: new RegExp(lessonAlpha) }),
    ).toHaveAttribute('href', `/en/learn/${slug}/${lessons.alpha}`);
    await expect(
      rows.getByRole('link', { name: new RegExp(lessonBeta) }),
    ).toHaveCount(0);

    await rows.getByRole('link', { name: new RegExp(lessonAlpha) }).click();
    await expect(page).toHaveURL(`/en/learn/${slug}/${lessons.alpha}`);
    await expect(
      page.getByRole('heading', { name: lessonAlpha, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(`About ${lessonAlpha}`)).toBeVisible();

    const video = page.getByTestId('lesson-video');
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute('controlslist', 'nodownload');
    await metadataLoaded(video);

    // The current lesson is marked in the side list; the locked one is not a link.
    const path = page.getByRole('list', { name: 'Lessons in this level' });
    await expect(path.locator('[aria-current="page"]')).toContainText(
      lessonAlpha,
    );
    await expect(
      path.getByRole('link', { name: new RegExp(lessonBeta) }),
    ).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/,
    );
  });

  test('a locked lesson asks anonymous visitors to sign in', async ({
    page,
  }) => {
    await page.goto(`/en/learn/${slug}/${lessons.beta}`);
    const gate = page.getByTestId('lesson-gate');
    await expect(
      gate.getByRole('heading', { name: 'Sign in to watch this lesson' }),
    ).toBeVisible();
    await expect(page.getByTestId('lesson-video')).toHaveCount(0);
    const next = encodeURIComponent(`/en/learn/${slug}/${lessons.beta}`);
    await expect(gate.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      `/en/login?next=${next}`,
    );
    await expect(
      gate.getByRole('link', { name: 'Create an account' }),
    ).toHaveAttribute('href', `/en/register?next=${next}`);

    // The playback API refuses the signed-out viewer too, not just the page.
    const status = await page.evaluate(async (id) => {
      const playback = await fetch(`/api/v1/lessons/${id}/playback`);
      return playback.status;
    }, lessons.beta);
    expect(status).toBe(401);
  });

  test('a signed-in learner plays a published level without a grant', async () => {
    await studentPage.goto(`/en/learn/${slug}/${lessons.beta}`);
    await expect(
      studentPage.getByRole('heading', { name: lessonBeta, level: 1 }),
    ).toBeVisible();
    const video = studentPage.getByTestId('lesson-video');
    await expect(video).toBeVisible();
    await metadataLoaded(video);
    await expect(studentPage.getByTestId('lesson-gate')).toHaveCount(0);

    // Every lesson in the side list is now open, and the previous lesson links.
    const previous = studentPage.getByRole('link', { name: /Previous lesson/ });
    await expect(previous).toHaveAttribute(
      'href',
      `/en/learn/${slug}/${lessons.alpha}`,
    );
  });

  test('a lesson without a video says it is coming soon, and the Arabic page mirrors', async () => {
    // Gamma's video was removed above. M12: it is read as the admin now,
    // because the enrolled student has not finished Beta, so for them Gamma
    // is sequence-locked (covered by z-progress.spec.ts).
    await adminPage.goto(`/ar/learn/${slug}/${lessons.gamma}`);
    await expect(adminPage.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(adminPage.getByTestId('video-coming-soon')).toContainText(
      'الفيديو قادم قريباً',
    );
    await expect(
      adminPage.getByRole('heading', { name: lessonGamma, level: 1 }),
    ).toBeVisible();
    await expect(adminPage.getByTestId('lesson-video')).toHaveCount(0);
  });
});
