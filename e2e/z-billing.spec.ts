// Named to run after the earlier critical-path specs. Sign-ups still use the
// shared retry helper because every e2e context occupies one IP throttle bucket.
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import { computeHmac } from '../apps/api/src/billing/paymob/paymob-hmac';

const webUrl = 'http://localhost:3210';
const apiUrl = 'http://localhost:4210';
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const paidSlug = `m11-paid-${runId}`;
const pendingSlug = `m11-pending-${runId}`;
const paidTitle = `مستوى الدفع ${runId}`;
const pendingTitle = `Pending level ${runId}`;
const lessonTitle = `أول درس ${runId}`;
const hmacSecret = 'e2e-hmac-secret';
const integrationId = 4242;
const student = {
  email: `m11-student-${runId}@example.com`,
  password: 'safe-password-123',
  name: `Billing Learner ${runId}`,
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

async function createLevel(
  admin: APIRequestContext,
  input: { slug: string; title: string; priceMinor: number; lesson?: string },
): Promise<{ id: string; lessonId?: string }> {
  const created = await admin.post('/api/v1/admin/levels', {
    data: {
      slug: input.slug,
      hanzi: '付款',
      title: { en: input.title, ar: input.title },
      summary: {
        en: 'A paid level used by the billing checkout test.',
        ar: 'مستوى مدفوع لاختبار رحلة الدفع.',
      },
      priceMinor: input.priceMinor,
    },
  });
  expect(created.status()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  let lessonId: string | undefined;
  if (input.lesson) {
    const lesson = await admin.post(`/api/v1/admin/levels/${id}/lessons`, {
      data: {
        title: { en: input.lesson, ar: input.lesson },
        isFreePreview: false,
      },
    });
    expect(lesson.status()).toBe(201);
    lessonId = ((await lesson.json()) as { id: string }).id;
    expect(
      (await admin.post(`/api/v1/admin/lessons/${lessonId}/publish`)).status(),
    ).toBe(200);
  }
  expect(
    (await admin.post(`/api/v1/admin/levels/${id}/publish`)).status(),
  ).toBe(200);
  return { id, lessonId };
}

async function openLevel(page: Page, slug: string, title: string) {
  await expect(async () => {
    await page.goto(`/ar/levels/${slug}`);
    await expect(
      page.getByRole('heading', { name: title, level: 1 }),
    ).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 90_000, intervals: [1000, 5000, 10_000] });
}

test.describe
  .serial('billing: checkout, confirmation and administration', () => {
  test.setTimeout(180_000);

  let adminApi: APIRequestContext;
  let studentApi: APIRequestContext;
  let studentContext: BrowserContext;
  let adminContext: BrowserContext;
  let studentPage: Page;
  let adminPage: Page;
  let paidLevelId = '';
  let pendingLevelId = '';
  let paidOrderId = '';
  let paidTransactionId = '';

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    adminApi = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { origin: webUrl },
    });
    expect((await fetch('http://127.0.0.1:4310/checkout')).status).toBe(200);
    const adminLogin = await withRetry(() =>
      adminApi.post('/api/v1/auth/login', {
        data: {
          email: process.env.E2E_ADMIN_EMAIL ?? '',
          password: process.env.E2E_ADMIN_PASSWORD ?? '',
        },
      }),
    );
    expect(adminLogin.status()).toBe(200);

    const paidLevel = await createLevel(adminApi, {
      slug: paidSlug,
      title: paidTitle,
      priceMinor: 150_000,
      lesson: lessonTitle,
    });
    paidLevelId = paidLevel.id;
    const pendingLevel = await createLevel(adminApi, {
      slug: pendingSlug,
      title: pendingTitle,
      priceMinor: 75_000,
    });
    pendingLevelId = pendingLevel.id;

    studentApi = await playwrightRequest.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: { origin: webUrl },
    });
    const registered = await withRetry(() =>
      studentApi.post('/api/v1/auth/register', { data: student }),
    );
    expect(registered.status()).toBe(201);

    studentContext = await browser.newContext({
      baseURL: webUrl,
      storageState: await studentApi.storageState(),
    });
    adminContext = await browser.newContext({
      baseURL: webUrl,
      storageState: await adminApi.storageState(),
    });
    studentPage = await studentContext.newPage();
    adminPage = await adminContext.newPage();
  });

  test.afterAll(async () => {
    await studentContext?.close();
    await adminContext?.close();
    await studentApi?.dispose();
    await adminApi?.dispose();
  });

  test('student buys a level, webhook confirms it, and the lesson opens', async () => {
    const page = studentPage;
    await openLevel(page, paidSlug, paidTitle);
    const buy = page.getByRole('button', { name: /اشترِ المستوى/ });
    await expect(buy).toContainText(/[٠-٩]/);
    await buy.click();
    await expect(page).toHaveURL(/127\.0\.0\.1:4310\/checkout/);
    const checkout = new URL(page.url());
    expect(checkout.searchParams.get('publicKey')).toBe('e2e-public-key');
    expect(checkout.searchParams.get('clientSecret')).toMatch(/^e2e-client-/);

    const listed = await adminApi.get(
      `/api/v1/admin/orders?q=${encodeURIComponent(student.email)}&page=1`,
    );
    expect(listed.status()).toBe(200);
    const orders = (await listed.json()) as {
      orders: Array<{ id: string; levelId: string }>;
    };
    paidOrderId =
      orders.orders.find((order) => order.levelId === paidLevelId)?.id ?? '';
    expect(paidOrderId).not.toBe('');
    const detailResponse = await adminApi.get(
      `/api/v1/admin/orders/${paidOrderId}`,
    );
    expect(detailResponse.status()).toBe(200);
    const detail = (await detailResponse.json()) as {
      amountMinor: number;
      currency: string;
      paymobOrderId: string;
      specialReference: string;
    };
    paidTransactionId = `e2e-tx-${runId}`;
    const object = {
      amount_cents: detail.amountMinor,
      created_at: new Date().toISOString(),
      currency: detail.currency,
      error_occured: false,
      has_parent_transaction: false,
      id: paidTransactionId,
      integration_id: integrationId,
      is_3d_secure: true,
      is_auth: false,
      is_capture: true,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: {
        id: detail.paymobOrderId,
        merchant_order_id: detail.specialReference,
      },
      owner: 99,
      pending: false,
      source_data: {
        pan: 'xxxx-xxxx-xxxx-4242',
        sub_type: 'MasterCard',
        type: 'card',
      },
      success: true,
    };
    const webhook = await studentApi.post(
      `/api/v1/webhooks/paymob?hmac=${computeHmac(object, hmacSecret)}`,
      { data: { type: 'TRANSACTION', obj: object } },
    );
    expect(webhook.status()).toBe(200);

    await page.goto(`/ar/checkout/result?order=${paidOrderId}&success=true`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const paid = page.getByTestId('billing-paid');
    await expect(paid).toBeVisible();
    await expect(paid).toContainText(paidTitle);
    await expect(paid).toContainText(/[٠-٩]/);
    await expect(page.getByRole('img', { name: 'بختم مازن' })).toBeVisible();

    await page.getByRole('link', { name: 'ابدأ الدرس الأول' }).click();
    await expect(page).toHaveURL(new RegExp(`/ar/levels/${paidSlug}$`));
    await expect(page.getByTestId('level-enrolled')).toBeVisible();
    await page.getByRole('link', { name: new RegExp(lessonTitle) }).click();
    await expect(page).toHaveURL(
      new RegExp(`/ar/learn/${paidSlug}/[0-9a-f-]{36}$`),
    );
    await expect(
      page.getByRole('heading', { name: lessonTitle, level: 1 }),
    ).toBeVisible();
  });

  test('an order without a callback stays in the calm confirming state', async () => {
    const checkout = await studentApi.post('/api/v1/billing/checkout', {
      data: { levelId: pendingLevelId, locale: 'en' },
    });
    expect(checkout.status()).toBe(201);
    const orderId = ((await checkout.json()) as { orderId: string }).orderId;
    await studentPage.goto(`/en/checkout/result?order=${orderId}`);
    await expect(studentPage.getByTestId('billing-confirming')).toBeVisible();
    await expect(
      studentPage.getByRole('heading', { name: 'Confirming your payment…' }),
    ).toBeVisible();
  });

  test('admin sees the paid order and its redacted transaction fields', async () => {
    const page = adminPage;
    await page.goto('/en/admin/orders');
    await expect(
      page.getByRole('heading', { name: 'Orders', level: 1 }),
    ).toBeVisible();
    await page.getByLabel('Search learner').fill(student.email);
    await page.getByRole('button', { name: 'Apply filters' }).click();
    const row = page.getByRole('row').filter({ hasText: paidTitle });
    await expect(row).toContainText('Paid');
    await row.getByRole('link').first().click();
    await expect(page).toHaveURL(
      new RegExp(`/en/admin/orders/${paidOrderId}$`),
    );
    await expect(
      page.getByText(paidTransactionId, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('4242', { exact: true })).toBeVisible();
    await expect(page.getByText('MasterCard · ending 4242')).toBeVisible();
    await expect(page.getByText('Success: Yes')).toBeVisible();
    await expect(page.getByText('Pending: No')).toBeVisible();
  });
});
