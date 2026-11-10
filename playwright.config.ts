import { defineConfig, devices } from '@playwright/test';

function port(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`Invalid e2e port: ${value}`);
  }
  return parsed;
}

const apiPort = port(process.env.E2E_API_PORT, 4210);
const webPort = port(process.env.E2E_WEB_PORT, 3210);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://localhost:${webPort}`;
const databaseUrl =
  process.env.DATABASE_URL_TEST ??
  'postgresql://postgres:postgres@localhost:5433/app_test?schema=public';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    ...(process.env.PLAYWRIGHT_CHANNEL === 'chrome'
      ? { channel: 'chrome' as const }
      : {}),
  },
  webServer: [
    {
      command:
        'pnpm --filter @app/api exec prisma migrate deploy && pnpm --filter @app/api build && node apps/api/dist/main.js',
      cwd: '.',
      env: {
        NODE_ENV: 'test',
        PORT: String(apiPort),
        DATABASE_URL: databaseUrl,
        DATABASE_URL_TEST: databaseUrl,
        APP_URL: webUrl,
        INTERNAL_API_URL: apiUrl,
        JWT_ACCESS_SECRET:
          'e2e-only-access-secret-at-least-thirty-two-characters',
        JWT_REFRESH_SECRET:
          'e2e-only-refresh-secret-at-least-thirty-two-characters',
      },
      url: `${apiUrl}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        `pnpm --filter @app/web build && ` +
        `pnpm --filter @app/web exec next start -p ${webPort}`,
      cwd: '.',
      env: {
        INTERNAL_API_URL: apiUrl,
        E2E_NEXT_START: '1',
      },
      url: `${webUrl}/ar/login`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
