import { expect, test } from '@playwright/test';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const account = {
  email: `student-${runId}@example.com`,
  name: `طالب ${runId}`,
  password: 'safe-password-123',
  phone: '٠١٠٠ ١٢٣ ٤٥٦٧',
};

test.describe.serial('identity web', () => {
  test('register, logout, protected redirect, login return, and logout', async ({
    page,
  }) => {
    await page.goto('/ar/register');
    await page.getByLabel('الاسم الكامل').fill(account.name);
    await page.getByLabel('البريد الإلكتروني').fill(account.email);
    await page.getByLabel('رقم الهاتف المحمول').fill(account.phone);
    await page
      .getByLabel('كلمة المرور', { exact: true })
      .fill(account.password);
    await page.getByRole('button', { name: 'أنشئ الحساب' }).click();

    await expect(page).toHaveURL(/\/ar\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: `مرحباً، ${account.name}` }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
    await expect(page).toHaveURL(/\/ar\/login$/);

    await page.goto('/ar/dashboard');
    await expect(page).toHaveURL(/\/ar\/login\?next=%2Far%2Fdashboard$/);
    await page.getByLabel('البريد الإلكتروني').fill(account.email);
    await page
      .getByLabel('كلمة المرور', { exact: true })
      .fill(account.password);
    await page.getByRole('button', { name: 'الدخول كطالب' }).click();
    await expect(page).toHaveURL(/\/ar\/dashboard$/);
    await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
    await expect(page).toHaveURL(/\/ar\/login$/);
  });

  test('locale direction and accessible empty-submit validation', async ({
    page,
  }) => {
    await page.goto('/ar/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await page.getByRole('button', { name: 'الدخول كطالب' }).click();
    await expect(
      page.getByText('أدخل بريداً إلكترونياً صحيحاً.'),
    ).toBeVisible();
    await expect(page.getByLabel('البريد الإلكتروني')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(
      page.getByLabel('كلمة المرور', { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true');

    await page.goto('/en/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('wrong password uses the mapped alert', async ({ page }) => {
    await page.goto('/ar/login');
    await page.getByLabel('البريد الإلكتروني').fill(account.email);
    await page
      .getByLabel('كلمة المرور', { exact: true })
      .fill('wrong-password');
    await page.getByRole('button', { name: 'الدخول كطالب' }).click();

    await expect(
      page.getByRole('alert').filter({
        hasText: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      }),
    ).toBeVisible();
  });

  test('expired access renews with the path-scoped refresh cookie', async ({
    context,
    page,
  }) => {
    await page.goto('/ar/login');
    await page.getByLabel('البريد الإلكتروني').fill(account.email);
    await page
      .getByLabel('كلمة المرور', { exact: true })
      .fill(account.password);
    await page.getByRole('button', { name: 'الدخول كطالب' }).click();
    await expect(page).toHaveURL(/\/ar\/dashboard$/);

    await context.clearCookies({ name: 'access_token' });
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.continue();
    });
    await page.goto('/ar/dashboard');
    await expect(page).toHaveURL(/\/ar\/session\/renew\?next=/);
    await expect(page.getByText('جارٍ استعادة جلستك…')).toBeVisible();
    await expect(page).toHaveURL(/\/ar\/dashboard$/, { timeout: 10_000 });
    await expect(
      page.getByRole('heading', { name: `مرحباً، ${account.name}` }),
    ).toBeVisible();
    await page.unroute('**/api/v1/auth/refresh');
  });

  test('student receives not found for admin', async ({ page }) => {
    await page.goto('/ar/login');
    await page.getByLabel('البريد الإلكتروني').fill(account.email);
    await page
      .getByLabel('كلمة المرور', { exact: true })
      .fill(account.password);
    await page.getByRole('button', { name: 'الدخول كطالب' }).click();
    await expect(page).toHaveURL(/\/ar\/dashboard$/);
    await page.goto('/ar/admin');
    await expect(page).toHaveURL(/\/ar\/admin$/);
    await expect(
      page.getByRole('heading', { name: 'الصفحة غير موجودة' }),
    ).toBeVisible();
  });
});
