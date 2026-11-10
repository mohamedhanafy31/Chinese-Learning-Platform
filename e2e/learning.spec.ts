import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const webUrl = 'http://localhost:3210';
const apiUrl = 'http://127.0.0.1:4210';
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const slug = `m5-${runId}`;
const levelTitle = `مستوى التعلّم ${runId}`;
const lessonAlpha = `Alpha ${runId}`;
const lessonBeta = `Beta ${runId}`;
const student = {
  name: `Learner ${runId}`,
  email: `learner-${runId}@example.com`,
  password: 'safe-password-123',
  phone: '01001234567',
};

const arabic = {
  email: 'البريد الإلكتروني',
  password: 'كلمة المرور',
  submit: 'سجّل الدخول',
};

async function createPublishedLevel(api: APIRequestContext): Promise<void> {
  const created = await api.post('/api/v1/admin/levels', {
    data: {
      slug,
      hanzi: '学习',
      title: { en: `Learning level ${runId}`, ar: levelTitle },
      summary: { en: 'Learning summary', ar: 'ملخص التعلّم' },
    },
  });
  expect(created.status()).toBe(201);
  const level = (await created.json()) as { id: string };

  const lessonIds: string[] = [];
  for (const [title, free] of [
    [lessonAlpha, true],
    [lessonBeta, false],
  ] as const) {
    const lesson = await api.post(`/api/v1/admin/levels/${level.id}/lessons`, {
      data: { title: { en: title }, isFreePreview: free },
    });
    expect(lesson.status()).toBe(201);
    lessonIds.push(((await lesson.json()) as { id: string }).id);
  }
  for (const id of lessonIds) {
    expect(
      (await api.post(`/api/v1/admin/lessons/${id}/publish`)).status(),
    ).toBe(200);
  }
  expect(
    (await api.post(`/api/v1/admin/levels/${level.id}/publish`)).status(),
  ).toBe(200);
}

async function openLevelPage(page: Page): Promise<void> {
  // The public catalog is cached for up to a minute, so retry until it shows.
  await expect(async () => {
    await page.goto(`/ar/levels/${slug}`);
    await expect(
      page.getByRole('heading', { name: levelTitle, level: 1 }),
    ).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 90_000, intervals: [1000, 5000, 10_000] });
}

test.describe.serial('enrollments: grant, learn, revoke', () => {
  let api: APIRequestContext;
  let adminContext: BrowserContext;
  let admin: Page;
  let studentContext: BrowserContext;
  let page: Page;
  let studentUrl = '';

  test.beforeAll(async ({ browser }) => {
    api = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { origin: webUrl },
    });
    const login = await api.post('/api/v1/auth/login', {
      data: {
        email: process.env.E2E_ADMIN_EMAIL ?? '',
        password: process.env.E2E_ADMIN_PASSWORD ?? '',
      },
    });
    expect(login.status()).toBe(200);
    await createPublishedLevel(api);

    adminContext = await browser.newContext({ baseURL: webUrl });
    admin = await adminContext.newPage();
    studentContext = await browser.newContext({ baseURL: webUrl });
    page = await studentContext.newPage();
    await admin.goto('/ar/login');
    await admin
      .getByLabel(arabic.email)
      .fill(process.env.E2E_ADMIN_EMAIL ?? '');
    await admin
      .getByLabel(arabic.password, { exact: true })
      .fill(process.env.E2E_ADMIN_PASSWORD ?? '');
    await admin.getByRole('button', { name: arabic.submit }).click();
    await expect(admin).toHaveURL(/\/ar\/admin$/);
  });

  test.afterAll(async () => {
    await adminContext?.close();
    await studentContext?.close();
    await api?.dispose();
  });

  test('admin finds a new student and grants a level; the student learns it', async () => {
    // ----- the student registers and starts empty ----------------------------
    await page.goto('/ar/register');
    await page.getByLabel('الاسم الكامل').fill(student.name);
    await page.getByLabel(arabic.email).fill(student.email);
    await page.getByLabel('رقم الهاتف المحمول').fill(student.phone);
    await page
      .getByLabel(arabic.password, { exact: true })
      .fill(student.password);
    await page.getByRole('button', { name: 'أنشئ الحساب' }).click();
    await expect(page).toHaveURL(/\/ar\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: 'مستوياتي', level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByText('ستظهر مستوياتك هنا بعد انضمامك إلى أحدها.'),
    ).toBeVisible();

    // Before the grant: previews are free, the rest is locked, buy is a stub.
    await openLevelPage(page);
    const lessons = page
      .getByRole('list', { name: 'دروس هذا المستوى' })
      .getByRole('listitem');
    await expect(lessons.nth(0)).toContainText(lessonAlpha);
    await expect(lessons.nth(0)).toContainText('مجاني');
    await expect(lessons.nth(1)).toContainText(lessonBeta);
    await expect(lessons.nth(1)).toContainText('مغلق');
    await expect(
      page.getByRole('button', { name: 'افتح هذا المستوى' }),
    ).toBeDisabled();

    // ----- admin searches the student and grants the level --------------------
    await admin.goto('/ar/admin/students');
    await expect(
      admin.getByRole('heading', { name: 'الطلاب', level: 1 }),
    ).toBeVisible();
    await admin.getByLabel('ابحث في الطلاب').fill(student.email.toUpperCase());
    await admin.getByRole('button', { name: 'بحث' }).click();
    await expect(admin).toHaveURL(/\/ar\/admin\/students\?query=/);
    const row = admin.getByRole('link', { name: student.name });
    await expect(row).toBeVisible();
    await expect(
      admin.getByRole('status').filter({ hasText: /^١ طلاب/ }),
    ).toBeVisible();
    await row.click();
    await expect(admin).toHaveURL(/\/ar\/admin\/students\/[0-9a-f-]{36}$/);
    studentUrl = admin.url();
    await expect(
      admin.getByRole('heading', { name: student.name, level: 1 }),
    ).toBeVisible();
    await expect(
      admin.getByText('ليس لدى هذا الطالب أي مستوى بعد.'),
    ).toBeVisible();

    await admin.getByLabel('المستوى', { exact: true }).selectOption({
      label: `学习 · ${levelTitle}`,
    });
    await admin.getByRole('button', { name: 'امنح المستوى' }).click();
    await expect(
      admin.getByRole('status').filter({ hasText: 'تم منح المستوى.' }),
    ).toBeVisible();
    const enrollment = admin.locator(`[data-enrollment="${slug}"]`);
    await expect(enrollment).toContainText('فعّال');
    await expect(enrollment).toContainText('منحه مسؤول');

    // ----- the student's dashboard and level page ---------------------------
    await page.goto('/ar/dashboard');
    const mine = page.getByRole('list', { name: 'مستوياتي' });
    await expect(mine.getByText(levelTitle)).toBeVisible();
    await expect(mine).toContainText('٢ دروس');
    await mine.getByRole('link', { name: /اذهب إلى المستوى/ }).click();
    await expect(page).toHaveURL(new RegExp(`/ar/levels/${slug}$`));
    await expect(page.getByTestId('level-enrolled')).toContainText(
      'أنت مسجّل في هذا المستوى',
    );
    await expect(
      page.getByRole('button', { name: 'افتح هذا المستوى' }),
    ).toHaveCount(0);
    const open = page
      .getByRole('list', { name: 'دروس هذا المستوى' })
      .getByRole('listitem');
    await expect(open).toHaveCount(2);
    await expect(open.nth(0)).toContainText('متاح');
    await expect(open.nth(1)).toContainText('متاح');
  });

  test('admin revokes with a reason; access falls back to previews', async () => {
    expect(studentUrl).not.toBe('');
    await admin.goto(studentUrl);
    const enrollment = admin.locator(`[data-enrollment="${slug}"]`);
    await expect(enrollment).toContainText('فعّال');
    await enrollment.getByRole('button', { name: /سحب/ }).click();
    const dialog = admin.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('السبب (اختياري)').fill('استرداد المبلغ يدوياً');
    await dialog.getByRole('button', { name: 'سحب الوصول' }).click();
    await expect(dialog).toBeHidden();
    await expect(enrollment).toContainText('مسحوب');
    await expect(enrollment).toContainText('السبب: استرداد المبلغ يدوياً');
    await expect(enrollment.getByRole('button', { name: /سحب/ })).toHaveCount(
      0,
    );

    // ----- the student is back to previews only ---------------------------
    await page.goto('/ar/dashboard');
    await expect(
      page.getByText('ستظهر مستوياتك هنا بعد انضمامك إلى أحدها.'),
    ).toBeVisible();
    await expect(page.getByRole('list', { name: 'مستوياتي' })).toHaveCount(0);

    await page.goto(`/ar/levels/${slug}`);
    await expect(page.getByTestId('level-enrolled')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'افتح هذا المستوى' }),
    ).toBeDisabled();
    const lessons = page
      .getByRole('list', { name: 'دروس هذا المستوى' })
      .getByRole('listitem');
    await expect(lessons.nth(0)).toContainText('مجاني');
    await expect(lessons.nth(1)).toContainText('مغلق');
  });

  test('an archived level stays readable for the learner who owns it', async () => {
    // May wait out one throttling window (see below).
    test.setTimeout(150_000);
    const students = await api.get(
      `/api/v1/admin/students?query=${encodeURIComponent(student.email)}`,
    );
    const { students: found } = (await students.json()) as {
      students: { id: string }[];
    };
    const studentId = found[0]?.id ?? '';
    const levels = (await (await api.get('/api/v1/admin/levels')).json()) as {
      levels: { id: string; slug: string }[];
    };
    const levelId =
      levels.levels.find((level) => level.slug === slug)?.id ?? '';
    expect(levelId).not.toBe('');
    expect(
      (
        await api.post(`/api/v1/admin/students/${studentId}/enrollments`, {
          data: { levelId },
        })
      ).status(),
    ).toBe(201);
    expect(
      (await api.post(`/api/v1/admin/levels/${levelId}/archive`)).status(),
    ).toBe(200);

    // The API allows 100 requests a minute per address and the whole suite
    // reaches it from one, so a page can briefly fail with a 429; retry.
    const mine = page.getByRole('list', { name: 'مستوياتي' });
    await expect(async () => {
      await page.goto('/ar/dashboard');
      await expect(mine.getByText(levelTitle)).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 90_000, intervals: [1000, 5000, 10_000] });
    await expect(mine).toContainText('مؤرشف');

    await mine.getByRole('link', { name: /اذهب إلى المستوى/ }).click();
    await expect(
      page.getByRole('heading', { name: levelTitle, level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId('level-enrolled')).toBeVisible();
    await expect(
      page.getByText('هذا المستوى مؤرشف، وما زال وصولك إليه قائماً.'),
    ).toBeVisible();
    await expect(
      page
        .getByRole('list', { name: 'دروس هذا المستوى' })
        .getByRole('listitem')
        .nth(1),
    ).toContainText('متاح');

    // Everyone else gets a 404 from the API. (The web page itself serves the
    // cached public detail for up to a minute, so it is not asserted here.)
    const anonymous = await playwrightRequest.newContext({ baseURL: apiUrl });
    for (const path of [
      `/api/v1/catalog/levels/${slug}`,
      `/api/v1/catalog/levels/${slug}/access`,
    ]) {
      expect((await anonymous.get(path)).status()).toBe(404);
    }
    await anonymous.dispose();
  });
});
