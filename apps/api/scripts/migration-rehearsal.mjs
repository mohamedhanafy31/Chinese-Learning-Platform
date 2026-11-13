import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import pg from 'pg';

const { Client } = pg;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(scriptDir, '..');
const migrationsDir = path.join(apiDir, 'prisma/migrations');
const sourceUrl =
  process.env.DATABASE_URL_TEST ??
  'postgresql://postgres:postgres@localhost:5433/app_test?schema=public';
const guard = spawnSync(
  process.execPath,
  [path.join(scriptDir, 'assert-test-db.mjs')],
  {
    env: { ...process.env, DATABASE_URL_TEST: sourceUrl },
    stdio: 'inherit',
  },
);
if (guard.status !== 0)
  throw new Error('Test database guard rejected migration rehearsal');

const source = new URL(sourceUrl);
const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
const baseDir = await mkdtemp(
  path.join(os.tmpdir(), 'cl-migration-rehearsal-'),
);
const configPath = path.join(apiDir, `.migration-rehearsal-${process.pid}.mjs`);
const scratchNames = ['rehearsal_test', 'rehearsal_failure_test'];
const created = [];

function prismaDeploy(databaseUrl, migrationPath) {
  const configSource = `import { defineConfig } from 'prisma/config';\nexport default defineConfig({ schema: ${JSON.stringify(path.join(apiDir, 'prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(migrationPath)} }, datasource: { url: process.env.DATABASE_URL } });\n`;
  return writeFile(configPath, configSource).then(() =>
    spawnSync(
      'pnpm',
      ['exec', 'prisma', 'migrate', 'deploy', '--config', configPath],
      {
        cwd: apiDir,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: 'utf8',
      },
    ),
  );
}

async function makeMigrationSet(label, throughAudit) {
  const target = path.join(baseDir, label);
  await cp(migrationsDir, target, { recursive: true });
  const dirs = await readdir(target, { withFileTypes: true });
  for (const entry of dirs) {
    if (!entry.isDirectory()) continue;
    if (throughAudit && entry.name > '20261111140000_audit') {
      await rm(path.join(target, entry.name), { recursive: true, force: true });
    }
  }
  return target;
}

async function clientFor(databaseName) {
  const databaseUrl = new URL(source);
  databaseUrl.pathname = `/${databaseName}`;
  const client = new Client({ connectionString: databaseUrl.toString() });
  await client.connect();
  return { client, url: databaseUrl.toString() };
}

async function seed(client, amountMinor, legacyShape) {
  const ids = Object.fromEntries(
    [
      'user',
      'level',
      'lesson',
      'asset',
      'orderOld',
      'orderNew',
      'quiz',
      'question',
    ].map((key) => [key, randomUUID()]),
  );
  const { user, level, lesson, asset, orderOld, orderNew, quiz, question } =
    ids;
  const priceMinor = legacyShape ? -5 : 500;
  const passingScore = legacyShape ? 150 : 70;
  const points = legacyShape ? 0 : 1;
  const watchedSec = legacyShape ? -9 : 0;
  await client.query(
    `INSERT INTO "User" (id,email,"passwordHash",name,phone,"updatedAt") VALUES ($1,$2,'x','Rehearsal','+201000000000',NOW())`,
    [user, `${user}@example.invalid`],
  );
  await client.query(
    `INSERT INTO "Level" (id,slug,hanzi,title,summary,topics,"priceMinor","sortOrder","updatedAt") VALUES ($1,$2,'入门','{"en":"Test"}','{}','[]',$3,1,NOW())`,
    [level, `rehearsal-${user}`, priceMinor],
  );
  await client.query(
    `INSERT INTO "Lesson" (id,"levelId",title,"sortOrder","updatedAt") VALUES ($1,$2,'{"en":"Lesson"}',1,NOW())`,
    [lesson, level],
  );
  await client.query(
    `INSERT INTO "VideoAsset" (id,"lessonId",provider,status,"localKey","originalName","updatedAt") VALUES ($1,$2,'LOCAL','READY',$3,'legacy.mp4',NOW())`,
    [asset, lesson, `${asset}.mp4`],
  );
  await client.query(`UPDATE "Lesson" SET "activeVideoId"=$1 WHERE id=$2`, [
    asset,
    lesson,
  ]);
  for (const [id, ref, date] of [
    [orderOld, 'old', '2020-01-01'],
    [orderNew, 'new', '2021-01-01'],
  ]) {
    await client.query(
      `INSERT INTO "Order" (id,"userId","levelId","amountMinor","specialReference","expiresAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),$6::timestamp,NOW())`,
      [id, user, level, amountMinor, `${user}-${ref}`, date],
    );
  }
  await client.query(
    `INSERT INTO "Quiz" (id,"lessonId",title,"passingScore","sortOrder","updatedAt") VALUES ($1,$2,'{"en":"Quiz"}',$3,1,NOW())`,
    [quiz, lesson, passingScore],
  );
  await client.query(
    `INSERT INTO "Question" (id,"quizId",type,prompt,points,"sortOrder","updatedAt") VALUES ($1,$2,'SINGLE','{"en":"Q"}',$3,1,NOW())`,
    [question, quiz, points],
  );
  await client.query(
    `INSERT INTO "LessonProgress" ("userId","lessonId","watchedSec","lastPositionSec","updatedAt") VALUES ($1,$2,$3,0,NOW())`,
    [user, lesson, watchedSec],
  );
  return ids;
}

async function runScenario(name, invalidAmount) {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created.push(name);
  } finally {
    await admin.end();
  }
  const { client, url } = await clientFor(name);
  try {
    const auditOnly = await makeMigrationSet(`${name}-audit`, true);
    const first = await prismaDeploy(url, auditOnly);
    if (first.status !== 0)
      throw new Error(
        `Audit migration failed: ${first.stderr || first.stdout}`,
      );
    const ids = await seed(client, invalidAmount ? 0 : 1000, !invalidAmount);
    const all = await makeMigrationSet(`${name}-all`, false);
    const deployed = await prismaDeploy(url, all);
    if (invalidAmount) {
      const message = `${deployed.stdout}\n${deployed.stderr}`;
      if (deployed.status === 0 || !message.includes('amountMinor <= 0')) {
        throw new Error(
          `Expected loud amountMinor migration failure, got: ${message}`,
        );
      }
      const unchanged = await client.query(
        `SELECT "amountMinor",status::text FROM "Order" WHERE id=$1`,
        [ids.orderOld],
      );
      const stillPending = await client.query(
        `SELECT count(*)::int AS count FROM "Order" WHERE "userId"=$1 AND status='PENDING'`,
        [ids.user],
      );
      if (
        unchanged.rows[0]?.amountMinor !== 0 ||
        unchanged.rows[0]?.status !== 'PENDING' ||
        stillPending.rows[0].count !== 2
      )
        throw new Error('Failing migration changed the invalid order');
      console.log(
        'FAILURE SCENARIO PASS: explicit amountMinor <= 0 error; invalid order unchanged',
      );
      return;
    }
    if (deployed.status !== 0)
      throw new Error(
        `Full migration failed: ${deployed.stderr || deployed.stdout}`,
      );
    const checks = await client.query(
      `SELECT (SELECT status::text FROM "Order" WHERE id=$1) AS old_status, (SELECT status::text FROM "Order" WHERE id=$2) AS new_status, (SELECT "priceMinor" FROM "Level" WHERE id=$3) AS price, (SELECT "passingScore" FROM "Quiz" WHERE id=$4) AS passing, (SELECT points FROM "Question" WHERE id=$5) AS points, (SELECT "watchedSec" FROM "LessonProgress" WHERE "userId"=$6 AND "lessonId"=$7) AS watched, (SELECT "activeVideoId" FROM "Lesson" WHERE id=$7) AS active`,
      [
        ids.orderOld,
        ids.orderNew,
        ids.level,
        ids.quiz,
        ids.question,
        ids.user,
        ids.lesson,
      ],
    );
    const row = checks.rows[0];
    if (
      row.old_status !== 'CANCELED' ||
      row.new_status !== 'PENDING' ||
      row.price !== null ||
      row.passing !== 100 ||
      row.points !== 1 ||
      row.watched !== 0 ||
      row.active !== ids.asset
    )
      throw new Error(`Legacy normalization mismatch: ${JSON.stringify(row)}`);
    const constraints = await client.query(
      `SELECT count(*)::int AS count FROM pg_constraint WHERE conname IN ('Order_one_pending_per_user_level','VideoAsset_provider_key_required','Level_priceMinor_nonnegative','LessonProgress_positions_nonnegative')`,
    );
    const pendingIndex = await client.query(
      `SELECT count(*)::int AS count FROM pg_indexes WHERE indexname='Order_one_pending_per_user_level'`,
    );
    if (constraints.rows[0].count < 3 || pendingIndex.rows[0].count !== 1)
      throw new Error('Expected data-integrity constraints are missing');
    console.log(
      'LEGACY SCENARIO PASS: duplicate pending order cancelled; values normalized; active video preserved; constraints present',
    );
  } finally {
    await client.end();
  }
}

try {
  for (const name of scratchNames) {
    const probe = new Client({ connectionString: adminUrl.toString() });
    await probe.connect();
    const exists = await probe.query(
      'SELECT 1 FROM pg_database WHERE datname=$1',
      [name],
    );
    await probe.end();
    if (exists.rowCount)
      throw new Error(
        `Refusing to overwrite existing scratch database ${name}`,
      );
  }
  await runScenario(scratchNames[0], false);
  await runScenario(scratchNames[1], true);
} finally {
  for (const name of created.reverse()) {
    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',
      [name],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.end();
  }
  await rm(configPath, { force: true });
  await rm(baseDir, { recursive: true, force: true });
}
