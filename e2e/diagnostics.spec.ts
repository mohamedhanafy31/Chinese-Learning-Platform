import { expect, test } from '@playwright/test';

const BUNNY_NAMES = [
  'BUNNY_LIBRARY_ID',
  'BUNNY_API_KEY',
  'BUNNY_TOKEN_KEY',
  'BUNNY_WEBHOOK_SECRET',
  'BUNNY_CDN_HOST',
];

test.describe('video diagnostics page', () => {
  test('shows the local provider, the missing Bunny settings and the webhook URL', async ({
    context,
    page,
  }) => {
    const email = process.env.E2E_ADMIN_EMAIL ?? '';
    const password = process.env.E2E_ADMIN_PASSWORD ?? '';
    expect(email).not.toBe('');

    await page.goto('/en/login');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/admin$/);

    // Reachable from the admin navigation.
    await page
      .getByRole('navigation', { name: 'Admin sections' })
      .getByRole('link', { name: 'Video diagnostics' })
      .click();
    await expect(page).toHaveURL(/\/en\/admin\/settings\/diagnostics$/);
    await expect(
      page.getByRole('heading', { name: 'Video diagnostics', level: 1 }),
    ).toBeVisible();

    await expect(page.getByTestId('diagnostics-active')).toHaveText('Local');
    await expect(page.getByTestId('diagnostics-configured')).toHaveText('No');
    const missing = page.getByTestId('diagnostics-missing');
    for (const name of BUNNY_NAMES) {
      const code = missing.locator('code', { hasText: name });
      await expect(code).toBeVisible();
      await expect(code).toHaveAttribute('dir', 'ltr');
    }
    await expect(page.getByTestId('diagnostics-last-webhook')).toHaveText(
      'Never received',
    );
    await expect(page.getByTestId('diagnostics-count-bunny')).toHaveText('0');

    const webhook = page.getByTestId('diagnostics-webhook-url');
    await expect(webhook).toHaveText(
      'http://localhost:3210/api/v1/webhooks/bunny',
    );
    await expect(webhook).toHaveAttribute('dir', 'ltr');

    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://localhost:3210',
    });
    await page.getByRole('button', { name: 'Copy address' }).click();
    await expect(page.getByText('Address copied.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'http://localhost:3210/api/v1/webhooks/bunny',
    );

    // Arabic reads right to left with Arabic digits for the counts.
    await page.goto('/ar/admin/settings/diagnostics');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('diagnostics-count-local')).toHaveText(
      /^[٠-٩]+$/,
    );
  });
});
