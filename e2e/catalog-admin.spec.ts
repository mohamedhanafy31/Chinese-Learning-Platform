import { deflateSync } from 'node:zlib';

import { expect, test, type Page } from '@playwright/test';

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const slug = `e2e-${runId}`;
const arabicTitle = `خطواتك الأولى ${runId}`;
const lessonAlpha = `E2E Lesson Alpha ${runId}`;
const lessonBeta = `E2E Lesson Beta ${runId}`;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data)
    crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** A small valid solid-colour RGB PNG, generated here so no fixture is committed. */
function solidPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: width }, () => [28, 63, 148]).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function signIn(
  page: Page,
  locale: string,
  email: string,
  password: string,
  labels: { email: string; password: string; submit: string },
): Promise<void> {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(labels.email).fill(email);
  await page.getByLabel(labels.password, { exact: true }).fill(password);
  await page.getByRole('button', { name: labels.submit }).click();
}

const english = {
  email: 'Email address',
  password: 'Password',
  submit: 'Log in',
};

test.describe.serial('catalog admin and public catalog', () => {
  let levelUrl = '';

  test('admin creates a level with lessons, publishes, reorders, and the public pages follow', async ({
    page,
    request,
  }) => {
    const email = process.env.E2E_ADMIN_EMAIL ?? '';
    const password = process.env.E2E_ADMIN_PASSWORD ?? '';
    expect(email).not.toBe('');

    await signIn(page, 'en', email, password, english);
    await expect(page).toHaveURL(/\/en\/admin$/);

    // ----- create the level ------------------------------------------------
    await page.goto('/en/admin/levels');
    await expect(
      page.getByRole('heading', { name: 'Levels', level: 1 }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'New level' }).click();
    await expect(page).toHaveURL(/\/en\/admin\/levels\/new$/);

    await page.getByLabel('Slug').fill(slug);
    await page.getByLabel('Chinese name').fill('入门');
    const title = page.getByRole('group', { name: 'Title', exact: true });
    await title.getByLabel('English').fill(`E2E First steps ${runId}`);
    await title.getByLabel('العربية').fill(arabicTitle);
    const summary = page.getByRole('group', { name: 'Summary', exact: true });
    await summary.getByLabel('English').fill('Pinyin, tones and greetings.');
    await summary.getByLabel('العربية').fill('النطق والنغمات والتحية.');
    await page.getByRole('button', { name: 'Add topic' }).click();
    const topic = page.getByRole('group', { name: 'Topic 1' });
    await topic.getByLabel('English').fill('Tones');
    await topic.getByLabel('العربية').fill('النغمات');
    await page.getByLabel('Price in EGP').fill('1500.50');

    await page.locator('#level-cover').setInputFiles({
      name: 'cover.png',
      mimeType: 'image/png',
      buffer: solidPng(400, 500),
    });
    await expect(
      page.getByRole('status').filter({ hasText: 'Image uploaded' }),
    ).toBeVisible();
    await expect(
      page.getByAltText('Preview of the selected image'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Create level' }).click();
    await expect(page).toHaveURL(/\/en\/admin\/levels\/[0-9a-f-]{36}$/);
    levelUrl = page.url();
    await expect(
      page.getByRole('heading', { name: `E2E First steps ${runId}`, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText('Draft: not visible to learners.'),
    ).toBeVisible();

    // ----- two lessons: Alpha (free preview) and Beta ----------------------
    for (const [name, free] of [
      [lessonAlpha, true],
      [lessonBeta, false],
    ] as const) {
      await page.goto(levelUrl);
      await page.getByRole('link', { name: 'Add lesson' }).click();
      await expect(page).toHaveURL(/\/lessons\/new$/);
      await page
        .getByRole('group', { name: 'Lesson title' })
        .getByLabel('English')
        .fill(name);
      if (free) await page.getByLabel('Free preview').check();
      await page.getByRole('button', { name: 'Create lesson' }).click();
      await expect(page).toHaveURL(/\/en\/admin\/lessons\/[0-9a-f-]{36}$/);
      await page.getByRole('button', { name: 'Publish' }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Published.' }),
      ).toBeVisible();
      await expect(
        page.getByText('Published: visible to learners.'),
      ).toBeVisible();
    }

    // ----- publish the level -------------------------------------------------
    await page.goto(levelUrl);
    const lessonsList = page.getByRole('list', { name: 'Lessons in order' });
    await expect(lessonsList.getByRole('listitem')).toHaveCount(2);
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Published.' }),
    ).toBeVisible();

    // ----- reorder lessons: Beta moves above Alpha ---------------------------
    const items = lessonsList.getByRole('listitem');
    await expect(items.nth(0)).toContainText(lessonAlpha);
    await page.getByRole('button', { name: `Move “${lessonBeta}” up` }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'is now lesson 1' }),
    ).toBeVisible();
    await expect(items.nth(0)).toContainText(lessonBeta);
    await page.reload();
    await expect(items.nth(0)).toContainText(lessonBeta);
    await expect(items.nth(1)).toContainText(lessonAlpha);

    // ----- public landing (Arabic) -------------------------------------------
    // The catalog is cached for 60 s, so reload until the new level appears.
    await expect(async () => {
      await page.goto('/ar');
      await expect(
        page.getByRole('radio', { name: new RegExp(arabicTitle) }),
      ).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 90_000, intervals: [1000, 5000, 10_000] });
    const ledgerLink = page.getByRole('link', {
      name: new RegExp(arabicTitle),
    });
    await expect(ledgerLink).toBeVisible();
    await expect(ledgerLink).toContainText('١٬٥٠٠٫٥٠');
    await expect(ledgerLink).toHaveAttribute('href', `/ar/levels/${slug}`);

    // ----- public level page --------------------------------------------------
    await page.goto(`/ar/levels/${slug}`);
    await expect(
      page.getByRole('heading', { name: arabicTitle, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('١٬٥٠٠٫٥٠').first()).toBeVisible();
    const lessons = page
      .getByRole('list', { name: 'دروس هذا المستوى' })
      .getByRole('listitem');
    await expect(lessons).toHaveCount(2);
    await expect(lessons.nth(0)).toContainText(lessonBeta);
    await expect(lessons.nth(0)).toContainText('مغلق');
    await expect(lessons.nth(1)).toContainText(lessonAlpha);
    await expect(lessons.nth(1)).toContainText('مجاني');
    // M11: a signed-in, unenrolled viewer of a priced level gets the live buy pill.
    await expect(
      page.getByRole('button', { name: /اشترِ المستوى/ }),
    ).toBeEnabled();

    const cover = page.getByTestId('level-cover').locator('img');
    await expect(cover).toBeVisible();
    await expect
      .poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    const coverSrc = await cover.getAttribute('src');
    expect(coverSrc).toMatch(/^\/media\/[0-9a-f]{64}\.webp$/);
    const media = await request.get(coverSrc ?? '');
    expect(media.status()).toBe(200);
    expect(media.headers()['content-type']).toContain('image/webp');

    // metadata for search and sharing
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`/ar/levels/${slug}$`),
    );
    await expect(
      page.locator('link[rel="alternate"][hreflang="en"]'),
    ).toHaveAttribute('href', new RegExp(`/en/levels/${slug}$`));
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      new RegExp(`${coverSrc}$`),
    );

    // unknown levels are a real 404
    const missing = await request.get('/ar/levels/does-not-exist');
    expect(missing.status()).toBe(404);

    // robots and sitemap
    const robots = await (await request.get('/robots.txt')).text();
    for (const path of [
      'admin',
      'dashboard',
      'session',
      'login',
      'register',
      'forgot-password',
      'reset-password',
    ]) {
      expect(robots).toContain(`Disallow: /*/${path}`);
    }
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const locale of ['ar', 'en', 'zh']) {
      expect(sitemap).toContain(`/${locale}/levels/${slug}`);
    }
  });

  test('a student receives not found for the admin catalog', async ({
    page,
    request,
  }) => {
    const email = `student-${runId}@example.com`;
    const password = 'safe-password-123';
    const registered = await request.post(
      'http://127.0.0.1:4210/api/v1/auth/register',
      {
        headers: { origin: 'http://localhost:3210' },
        data: {
          email,
          password,
          name: `Student ${runId}`,
          phone: '+201001234567',
        },
      },
    );
    expect(registered.status()).toBe(201);

    await signIn(page, 'ar', email, password, {
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      submit: 'سجّل الدخول',
    });
    await expect(page).toHaveURL(/\/ar\/dashboard$/);
    await page.goto('/ar/admin/levels');
    await expect(page).toHaveURL(/\/ar\/admin\/levels$/);
    await expect(
      page.getByRole('heading', { name: 'الصفحة غير موجودة' }),
    ).toBeVisible();
  });
});
