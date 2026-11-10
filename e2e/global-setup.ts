import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { FullConfig } from '@playwright/test';

/**
 * Creates the e2e ADMIN account: registered through the public API (so the
 * password is hashed exactly as in production), then promoted directly in the
 * test database, the same step the `admin:create` CLI performs. Credentials are
 * handed to the specs through the environment.
 */
export default async function globalSetup(
  config: FullConfig,
): Promise<() => Promise<void>> {
  const webUrl = config.projects[0]?.use.baseURL ?? 'http://localhost:3210';
  const apiPort = process.env.E2E_API_PORT ?? '4210';
  const databaseUrl =
    process.env.DATABASE_URL_TEST ??
    'postgresql://postgres:postgres@localhost:5433/app_test?schema=public';

  const email = `e2e-admin-${Date.now()}-${randomBytes(3).toString('hex')}@example.com`;
  const password = `pw-${randomBytes(9).toString('base64url')}`;

  const response = await fetch(
    `http://127.0.0.1:${apiPort}/api/v1/auth/register`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: webUrl },
      body: JSON.stringify({
        email,
        password,
        name: 'E2E Admin',
        phone: '+201001234567',
      }),
    },
  );
  if (response.status !== 201) {
    throw new Error(`Could not register the e2e admin (${response.status})`);
  }

  // `pg` belongs to the API workspace, so resolve it from there.
  const apiRequire = createRequire(
    path.resolve(__dirname, '../apps/api/package.json'),
  );
  const { Client } = apiRequire('pg') as typeof import('pg');
  const client = new Client({
    connectionString: databaseUrl.replace(/\?schema=\w+$/, ''),
  });
  await client.connect();
  try {
    const updated = await client.query(
      `UPDATE "User" SET role = 'ADMIN' WHERE email = $1`,
      [email],
    );
    if (updated.rowCount !== 1) throw new Error('Admin promotion failed');
  } finally {
    await client.end();
  }

  process.env.E2E_ADMIN_EMAIL = email;
  process.env.E2E_ADMIN_PASSWORD = password;

  const uploadsDir = process.env.E2E_UPLOADS_DIR;
  return async () => {
    if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true });
  };
}
