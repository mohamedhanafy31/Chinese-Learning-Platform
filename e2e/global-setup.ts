import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
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

  // A tiny real MP4 for the video specs. Without ffmpeg those specs skip.
  let videoDir: string | undefined;
  try {
    videoDir = await mkdtemp(path.join(os.tmpdir(), 'cl-e2e-video-'));
    const fixture = path.join(videoDir, 'e2e-lesson.mp4');
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=160x90:rate=10',
        '-t',
        '2',
        '-pix_fmt',
        'yuv420p',
        fixture,
      ],
      { stdio: 'ignore' },
    );
    process.env.E2E_VIDEO_FIXTURE = fixture;
  } catch {
    console.warn('ffmpeg is unavailable: the video e2e specs will be skipped.');
  }

  const uploadsDir = process.env.E2E_UPLOADS_DIR;
  return async () => {
    if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true });
    if (videoDir) await rm(videoDir, { recursive: true, force: true });
  };
}
