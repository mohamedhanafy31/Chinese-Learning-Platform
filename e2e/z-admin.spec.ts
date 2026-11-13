// Runs after the core journeys. Registration shares one IP throttle bucket
// across the complete suite, so the student setup retries 429 responses.
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const webUrl = 'http://localhost:3210';
// Use localhost like the web origin so API-set cookies carry into the browser.
const apiUrl = 'http://localhost:4210';
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const slug = `m13-admin-${runId}`;
const levelTitle = `مستوى التدقيق ${runId}`;
const student = {
  email: `m13-student-${runId}@example.com`,
  password: 'safe-password-123',
  name: `طالب التدقيق ${runId}`,
  phone: '01001234567',
};

type ApiResponse = { status(): number };

async function withRetry<T extends ApiResponse>(
  action: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await action();
    if (response.status() !== 429 || attempt >= 8) return response;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

test.describe.serial('M13 admin overview, audit and student status', () => {
  test.setTimeout(180_000);

  let adminApi: APIRequestContext;
  let studentApi: APIRequestContext;
  let adminContext: BrowserContext;
  let studentContext: BrowserContext;
  let adminPage: Page;
  let studentPage: Page;
  let levelId = '';
  let studentId = '';

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    adminApi = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { origin: webUrl },
    });
    const adminLogin = await withRetry(() =>
      adminApi.post('/api/v1/auth/admin/login', {
        data: {
          email: process.env.E2E_ADMIN_EMAIL ?? '',
          password: process.env.E2E_ADMIN_PASSWORD ?? '',
        },
      }),
    );
    expect(adminLogin.status()).toBe(200);

    const createdLevel = await adminApi.post('/api/v1/admin/levels', {
      data: {
        slug,
        hanzi: '审计',
        title: { ar: levelTitle, en: `Audit level ${runId}` },
        summary: {
          ar: 'مستوى لاختبار سجل التغييرات.',
          en: 'A level for the audit log journey.',
        },
      },
    });
    expect(createdLevel.status()).toBe(201);
    levelId = ((await createdLevel.json()) as { id: string }).id;

    studentApi = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { origin: webUrl },
    });
    const registered = await withRetry(() =>
      studentApi.post('/api/v1/auth/register', { data: student }),
    );
    expect(registered.status()).toBe(201);
    studentId = ((await registered.json()) as { user: { id: string } }).user.id;

    adminContext = await browser.newContext({
      baseURL: webUrl,
      storageState: await adminApi.storageState(),
    });
    studentContext = await browser.newContext({
      baseURL: webUrl,
      storageState: await studentApi.storageState(),
    });
    adminPage = await adminContext.newPage();
    studentPage = await studentContext.newPage();
    await studentPage.goto('/ar/dashboard');
    await expect(studentPage).toHaveURL(/\/ar\/dashboard$/);
  });

  test.afterAll(async () => {
    await adminContext?.close();
    await studentContext?.close();
    await studentApi?.dispose();
    await adminApi?.dispose();
  });

  test('publishing a level appears in the Arabic audit log with its link', async () => {
    await adminPage.goto(`/ar/admin/levels/${levelId}`);
    await expect(
      adminPage.getByRole('heading', { name: levelTitle, level: 1 }),
    ).toBeVisible();
    await adminPage.getByRole('button', { name: 'انشر' }).click();
    await expect(
      adminPage.getByRole('status').filter({ hasText: 'تم النشر.' }),
    ).toBeVisible();

    const query = new URLSearchParams({
      entity: 'Level',
      entityId: levelId,
      action: 'level.publish',
    });
    await adminPage.goto(`/ar/admin/audit?${query}`);
    const row = adminPage.locator('[data-audit-action="level.publish"]');
    await expect(row).toHaveCount(1);
    const link = row.getByRole('link', {
      name: `نشر المستوى «${levelTitle}»`,
    });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', `/ar/admin/levels/${levelId}`);
  });

  test('deactivating a student signs out their open session on navigation', async () => {
    await adminPage.goto(`/ar/admin/students/${studentId}`);
    await expect(
      adminPage.getByRole('heading', { name: student.name, level: 1 }),
    ).toBeVisible();
    await adminPage.getByRole('button', { name: 'تعطيل الحساب…' }).click();
    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toContainText('كل الأجهزة');
    await dialog.getByRole('button', { name: 'تعطيل الحساب' }).click();
    await expect(dialog).toBeHidden();
    await expect(adminPage.getByTestId('student-status')).toContainText(
      'حساب معطَّل',
    );

    await studentPage.goto('/ar/dashboard');
    await expect(studentPage).toHaveURL(/\/ar\/login\?next=/);
    await expect(
      studentPage.getByRole('heading', { name: 'مرحباً بعودتك', level: 1 }),
    ).toBeVisible();
  });

  test('the admin home renders learner-focused overview information', async () => {
    const overviewResponse = await adminApi.get('/api/v1/admin/overview');
    expect(overviewResponse.status()).toBe(200);
    const overview = (await overviewResponse.json()) as {
      students: { total: number };
    };

    await adminPage.goto('/ar/admin');
    const expectedStudents = new Intl.NumberFormat('ar-EG').format(
      overview.students.total,
    );
    await expect(adminPage.locator('[data-stat="students"] dd')).toHaveText(
      expectedStudents,
    );
    await expect(adminPage.getByText('الدفع غير مُعدّ بعد')).toHaveCount(0);
    await expect(adminPage.getByText(/Bunny|Paymob|الخادم/)).toHaveCount(0);
  });
});
