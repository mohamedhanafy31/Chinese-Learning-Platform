import { createHash, createHmac, randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { Role } from '@app/shared';

import { PrismaClient } from '../src/generated/prisma/client';

const origin = 'http://localhost:3000';
const password = 'initial-password';
const VIDEO_MAX_BYTES = 200_000;

const LIBRARY_ID = '4242';
const API_KEY = 'mock-bunny-api-key';
const TOKEN_KEY = 'mock-bunny-token-key';
const WEBHOOK_SECRET = 'mock-bunny-webhook-secret';
const CDN_HOST = 'vz-mock.b-cdn.net';
const EMBED_TTL = 7200;

type Agent = ReturnType<typeof request.agent>;
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head';
type Json = Record<string, unknown>;

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

// ----- the mock Bunny server ---------------------------------------------------

interface Recorded {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}

class MockBunny {
  readonly requests: Recorded[] = [];
  readonly videos = new Map<string, { status: number; length: number }>();
  failCreate = false;
  private server: Server | undefined;
  baseUrl = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () =>
        this.handle(req, res, Buffer.concat(chunks).toString('utf8')),
      );
    });
    await new Promise<void>((resolve) =>
      this.server?.listen(0, '127.0.0.1', resolve),
    );
    const { port } = this.server?.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      this.server.closeAllConnections();
    });
  }

  reset(): void {
    this.requests.length = 0;
    this.videos.clear();
    this.failCreate = false;
  }

  calls(method: string, suffix = ''): Recorded[] {
    return this.requests.filter(
      (entry) => entry.method === method && entry.url.endsWith(suffix),
    );
  }

  private handle(
    req: IncomingMessage,
    res: ServerResponse,
    body: string,
  ): void {
    const url = req.url ?? '';
    const method = req.method ?? 'GET';
    this.requests.push({ method, url, headers: req.headers, body });
    const json = (status: number, payload?: unknown): void => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(payload === undefined ? '' : JSON.stringify(payload));
    };
    const match = /^\/library\/(\d+)\/videos(?:\/([^/?]+))?$/.exec(url);
    if (!match) return json(404, { message: 'no route' });
    const guid = match[2];
    if (method === 'POST' && !guid) {
      if (this.failCreate) return json(500, { message: 'boom' });
      const created = randomUUID();
      this.videos.set(created, { status: 0, length: 0 });
      return json(200, { guid: created, title: 'x' });
    }
    if (!guid) return json(404);
    if (method === 'GET') {
      const video = this.videos.get(guid);
      if (!video) return json(404, { message: 'not found' });
      return json(200, {
        guid,
        status: video.status,
        length: video.length,
        encodeProgress: video.status >= 3 ? 100 : 40,
      });
    }
    if (method === 'DELETE') {
      if (!this.videos.delete(guid)) return json(404);
      return json(200, { success: true });
    }
    return json(405);
  }
}

interface Server4Test {
  url: string;
  child: ChildProcess;
  output: () => string;
  /** Asks the server to run one reconcile pass. */
  reconcile: () => Promise<Json>;
  stop: () => Promise<void>;
}

async function bootServer(
  env: Record<string, string>,
  uploadsDir: string,
): Promise<Server4Test> {
  let output = '';
  const child = fork('test/test-server.ts', {
    cwd: process.cwd(),
    execArgv: ['--import', 'tsx'],
    env: {
      ...process.env,
      UPLOADS_DIR: uploadsDir,
      VIDEO_MAX_BYTES: String(VIDEO_MAX_BYTES),
      VIDEO_RECONCILE_INTERVAL_SEC: '0',
      ...env,
    },
    silent: true,
  });
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Test API timed out. Output:\n${output}`)),
      20_000,
    );
    child.on('message', (message: { type: string; port?: number }) => {
      if (message.type === 'ready' && message.port) {
        clearTimeout(timeout);
        resolve(message.port);
      }
    });
    child.once('exit', (code) =>
      reject(new Error(`Test API exited (${code}). Output:\n${output}`)),
    );
  });
  return {
    url: `http://127.0.0.1:${port}`,
    child,
    output: () => output,
    reconcile: () =>
      new Promise<Json>((resolve, reject) => {
        const requestId = randomUUID();
        const listener = (message: {
          requestId?: string;
          type: string;
          result?: Json;
          error?: string;
        }): void => {
          if (message.requestId !== requestId) return;
          child.off('message', listener);
          if (message.type === 'error') reject(new Error(message.error));
          else resolve(message.result ?? {});
        };
        child.on('message', listener);
        child.send({ type: 'video:reconcile', requestId });
      }),
    stop: async () => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await new Promise<void>((resolve) =>
          child.once('exit', () => resolve()),
        );
      }
    },
  };
}

// ----- the suite -------------------------------------------------------------

describe('bunny video (e2e)', () => {
  const mock = new MockBunny();
  let api: Server4Test;
  let plain: Server4Test;
  let apiUrl: string;
  let prisma: PrismaClient;
  let uploadsDir: string;
  let videosDir: string;
  let admin: Agent;
  let ipCounter = 0;
  let phoneCounter = 0;

  function call(
    agent: Agent | undefined,
    method: Method,
    route: string,
    base = apiUrl,
  ) {
    ipCounter += 1;
    const target = agent ? agent[method](route) : request(base)[method](route);
    return target
      .set('Origin', origin)
      .set(
        'X-Forwarded-For',
        `198.52.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`,
      );
  }

  async function signIn(
    email: string,
    role: Role,
  ): Promise<{ agent: Agent; id: string }> {
    const agent = request.agent(apiUrl);
    phoneCounter += 1;
    await call(agent, 'post', '/api/v1/auth/register')
      .send({
        email,
        password,
        name: 'Bunny User',
        phone: `+2011${String(30_000_000 + phoneCounter)}`,
      })
      .expect(201);
    const user = await prisma.user.update({ where: { email }, data: { role } });
    await call(
      agent,
      'post',
      role === Role.ADMIN ? '/api/v1/auth/admin/login' : '/api/v1/auth/login',
    )
      .send({ email, password })
      .expect(200);
    return { agent, id: user.id };
  }

  /** The beforeEach admin, signed in on the server without Bunny. */
  async function plainAdmin(): Promise<Agent> {
    const agent = request.agent(plain.url);
    await call(agent, 'post', '/api/v1/auth/admin/login')
      .send({ email: 'bunny-admin@example.com', password })
      .expect(200);
    return agent;
  }

  async function createLevel(slug: string): Promise<string> {
    const response = await call(admin, 'post', '/api/v1/admin/levels')
      .send({
        slug,
        hanzi: '入门',
        title: { en: `Title ${slug}` },
        summary: { en: 'Summary' },
      })
      .expect(201);
    return (response.body as Json).id as string;
  }

  async function createLesson(
    levelId: string,
    title: string,
    extra: Json = {},
  ): Promise<string> {
    const response = await call(
      admin,
      'post',
      `/api/v1/admin/levels/${levelId}/lessons`,
    )
      .send({ title: { en: title }, ...extra })
      .expect(201);
    return (response.body as Json).id as string;
  }

  async function publish(
    kind: 'levels' | 'lessons',
    id: string,
  ): Promise<void> {
    await call(admin, 'post', `/api/v1/admin/${kind}/${id}/publish`).expect(
      200,
    );
  }

  /** A published level with a free preview, a locked and an unpublished lesson. */
  async function seed(slug: string) {
    const levelId = await createLevel(slug);
    const preview = await createLesson(levelId, 'Preview', {
      isFreePreview: true,
    });
    const locked = await createLesson(levelId, 'Locked');
    const hidden = await createLesson(levelId, 'Hidden');
    await publish('lessons', preview);
    await publish('lessons', locked);
    await publish('levels', levelId);
    return { levelId, slug, preview, locked, hidden };
  }

  async function bareLesson(slug = `bv-${randomUUID().slice(0, 8)}`) {
    const levelId = await createLevel(slug);
    const lessonId = await createLesson(levelId, 'Lesson');
    return { levelId, lessonId, slug };
  }

  interface Ticket {
    assetId: string;
    guid: string;
    body: Json;
  }

  async function startUpload(
    lessonId: string,
    originalName = 'lesson.mp4',
    extra: Json = {},
  ): Promise<Ticket> {
    const response = await call(
      admin,
      'post',
      `/api/v1/admin/lessons/${lessonId}/videos`,
    )
      .send({ originalName, ...extra })
      .expect(201);
    const body = response.body as Json;
    const tus = body.tus as { headers: { VideoId: string } };
    return {
      assetId: body.assetId as string,
      guid: tus.headers.VideoId,
      body,
    };
  }

  const uploaded = (assetId: string) =>
    call(admin, 'post', `/api/v1/admin/videos/${assetId}/uploaded`);

  /** An upload that finished in the browser and now waits on Bunny. */
  async function processing(
    lessonId: string,
    name = 'lesson.mp4',
  ): Promise<Ticket> {
    const ticket = await startUpload(lessonId, name);
    await uploaded(ticket.assetId).expect(204);
    return ticket;
  }

  function bunnyEvent(guid: string, status: number, library = LIBRARY_ID) {
    return JSON.stringify({
      VideoLibraryId: Number(library),
      VideoGuid: guid,
      Status: status,
    });
  }

  function sign(body: string, secret = WEBHOOK_SECRET): string {
    return createHmac('sha256', secret).update(body).digest('hex');
  }

  function webhook(
    body: string,
    headers: Record<string, string | undefined> = {
      'X-BunnyStream-Signature': sign(body),
      'X-BunnyStream-Signature-Version': 'v1',
      'X-BunnyStream-Signature-Algorithm': 'hmac-sha256',
    },
    base = apiUrl,
  ) {
    ipCounter += 1;
    let req = request(base)
      .post('/api/v1/webhooks/bunny')
      .set('Content-Type', 'application/json')
      .set('X-Forwarded-For', `198.53.0.${(ipCounter % 250) + 1}`);
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) req = req.set(key, value);
    }
    return req.send(body);
  }

  /** Delivers a correctly signed webhook. */
  const deliver = (guid: string, status: number) =>
    webhook(bunnyEvent(guid, status));

  const asset = (id: string) => prisma.videoAsset.findUnique({ where: { id } });
  const activeOf = async (lessonId: string) =>
    (await prisma.lesson.findUnique({ where: { id: lessonId } }))
      ?.activeVideoId ?? null;
  const adminLesson = async (lessonId: string): Promise<Json> =>
    (await call(admin, 'get', `/api/v1/admin/lessons/${lessonId}`).expect(200))
      .body as Json;

  /** A LOCAL asset made directly in the database, with a real file on disk. */
  async function localAsset(
    lessonId: string,
    createdAt = new Date(Date.now() - 3_600_000),
  ) {
    const id = randomUUID();
    const localKey = `${id}.mp4`;
    await writeFile(path.join(videosDir, localKey), Buffer.alloc(2048, 7));
    const row = await prisma.videoAsset.create({
      data: {
        id,
        lessonId,
        provider: 'LOCAL',
        status: 'READY',
        localKey,
        mime: 'video/mp4',
        sizeBytes: 2048n,
        originalName: 'local.mp4',
        createdAt,
      },
    });
    await prisma.lesson.update({
      where: { id: lessonId },
      data: { activeVideoId: id },
    });
    return row;
  }

  async function clean(): Promise<void> {
    await prisma.webhookEvent.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.level.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
    for (const name of await readdir(videosDir)) {
      await rm(path.join(videosDir, name), { force: true });
    }
  }

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'cl-bunny-spec-'));
    videosDir = path.join(uploadsDir, 'videos');
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    await mock.start();
    api = await bootServer(
      {
        BUNNY_LIBRARY_ID: LIBRARY_ID,
        BUNNY_API_KEY: API_KEY,
        BUNNY_TOKEN_KEY: TOKEN_KEY,
        BUNNY_WEBHOOK_SECRET: WEBHOOK_SECRET,
        BUNNY_CDN_HOST: CDN_HOST,
        BUNNY_API_BASE: mock.baseUrl,
        BUNNY_EMBED_BASE: mock.baseUrl,
        BUNNY_EMBED_TTL_SEC: String(EMBED_TTL),
      },
      uploadsDir,
    );
    apiUrl = api.url;
    plain = await bootServer(
      {
        BUNNY_LIBRARY_ID: '',
        BUNNY_API_KEY: '',
        BUNNY_TOKEN_KEY: '',
        BUNNY_WEBHOOK_SECRET: '',
        BUNNY_CDN_HOST: '',
      },
      uploadsDir,
    );
  }, 60_000);

  beforeEach(async () => {
    await clean();
    mock.reset();
    phoneCounter = 0;
    admin = (await signIn('bunny-admin@example.com', Role.ADMIN)).agent;
  });

  afterAll(async () => {
    if (prisma) {
      await clean();
      await prisma.$disconnect();
    }
    await api?.stop();
    await plain?.stop();
    await mock.stop();
    if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true });
  });

  // ----- creating an upload --------------------------------------------------

  it('creates a Bunny video and a signed TUS upload without exposing secrets', async () => {
    const { lessonId, slug } = await bareLesson();
    const before = Math.floor(Date.now() / 1000);
    const ticket = await startUpload(lessonId, 'Lesson 1.mp4', {
      sizeBytes: 1000,
      durationSec: 90,
    });
    const body = ticket.body as {
      tus: { endpoint: string; headers: Record<string, string> };
      metadata: Json;
    };

    const created = mock.calls('POST', '/videos');
    expect(created).toHaveLength(1);
    expect(created[0]?.headers.accesskey).toBe(API_KEY);
    expect(JSON.parse(created[0]?.body ?? '{}')).toEqual({
      title: `${slug} / 1 / Lesson 1.mp4`,
    });

    expect(body.tus.endpoint).toBe(`${mock.baseUrl}/tusupload`);
    const { headers } = body.tus;
    expect(headers.VideoId).toBe(ticket.guid);
    expect(headers.LibraryId).toBe(LIBRARY_ID);
    const expire = Number(headers.AuthorizationExpire);
    expect(expire).toBeGreaterThanOrEqual(before + 6 * 3600);
    expect(expire).toBeLessThanOrEqual(before + 6 * 3600 + 30);
    expect(headers.AuthorizationSignature).toBe(
      sha256(`${LIBRARY_ID}${API_KEY}${expire}${ticket.guid}`),
    );
    expect(body.metadata).toEqual({
      filetype: 'video/mp4',
      title: `${slug} / 1 / Lesson 1.mp4`,
    });
    const text = JSON.stringify(ticket.body);
    for (const secret of [API_KEY, TOKEN_KEY, WEBHOOK_SECRET]) {
      expect(text).not.toContain(secret);
    }

    const row = await asset(ticket.assetId);
    expect(row).toMatchObject({
      provider: 'BUNNY',
      status: 'UPLOADING',
      lessonId,
      bunnyLibraryId: LIBRARY_ID,
      bunnyVideoId: ticket.guid,
      durationSec: 90,
      originalName: 'Lesson 1.mp4',
    });
    expect(row?.sizeBytes).toBe(1000n);
    expect(await activeOf(lessonId)).toBeNull();

    const descriptor = await adminLesson(lessonId);
    expect(descriptor.video).toBeNull();
    expect(descriptor.pendingVideo).toMatchObject({
      id: ticket.assetId,
      status: 'UPLOADING',
    });
    expect((descriptor.pendingVideo as Json).failureReason).toBeUndefined();
  });

  it('validates the upload request', async () => {
    const { lessonId } = await bareLesson();
    const post = (body: Json, id = lessonId) =>
      call(admin, 'post', `/api/v1/admin/lessons/${id}/videos`).send(body);
    await post({}).expect(400);
    await post({ originalName: '' }).expect(400);
    await post({ originalName: 'x'.repeat(256) + '.mp4' }).expect(400);
    await post({ originalName: 'a.mp4', sizeBytes: 0 }).expect(400);
    await post({
      originalName: 'a.mp4',
      sizeBytes: VIDEO_MAX_BYTES + 1,
    }).expect(413);
    await post({ originalName: 'notes.txt' }).expect(415);
    await post({ originalName: 'a.mp4' }, randomUUID()).expect(404);
    expect(mock.calls('POST', '/videos')).toHaveLength(0);
    expect(await prisma.videoAsset.count()).toBe(0);
  });

  it('answers 502 and keeps no asset row when Bunny fails to create the video', async () => {
    const { lessonId } = await bareLesson();
    mock.failCreate = true;
    const response = await call(
      admin,
      'post',
      `/api/v1/admin/lessons/${lessonId}/videos`,
    )
      .send({ originalName: 'a.mp4' })
      .expect(502);
    expect(JSON.stringify(response.body)).not.toContain(API_KEY);
    expect(await prisma.videoAsset.count()).toBe(0);
  });

  it('refuses creation with 409 when Bunny is not configured', async () => {
    const { lessonId } = await bareLesson();
    // The admin session cookie is valid on the Bunny-less server too.
    const refused = await call(
      await plainAdmin(),
      'post',
      `/api/v1/admin/lessons/${lessonId}/videos`,
    ).send({
      originalName: 'a.mp4',
    });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      message: expect.stringContaining('/videos/local') as unknown as string,
    });
    expect(mock.calls('POST', '/videos')).toHaveLength(0);
    expect(await prisma.videoAsset.count()).toBe(0);
  });

  it('keeps the new routes behind authentication and the admin role', async () => {
    const { lessonId } = await bareLesson();
    const ticket = await startUpload(lessonId);
    const { agent: student } = await signIn(
      'bunny-student@example.com',
      Role.STUDENT,
    );
    for (const [method, route] of [
      ['post', `/api/v1/admin/lessons/${lessonId}/videos`],
      ['post', `/api/v1/admin/videos/${ticket.assetId}/uploaded`],
    ] as const) {
      expect((await call(undefined, method, route).send({})).status).toBe(401);
      expect((await call(student, method, route).send({})).status).toBe(403);
    }
    expect((await asset(ticket.assetId))?.status).toBe('UPLOADING');
  });

  // ----- uploaded ------------------------------------------------------------

  it('moves UPLOADING to PROCESSING once, idempotently, and ignores other assets', async () => {
    const { lessonId } = await bareLesson();
    const ticket = await startUpload(lessonId);
    await uploaded(ticket.assetId).expect(204);
    expect((await asset(ticket.assetId))?.status).toBe('PROCESSING');
    await uploaded(ticket.assetId).expect(204);
    expect((await asset(ticket.assetId))?.status).toBe('PROCESSING');

    const local = await localAsset(lessonId);
    await uploaded(local.id).expect(204);
    expect((await asset(local.id))?.status).toBe('READY');
    expect((await asset(local.id))?.provider).toBe('LOCAL');

    await uploaded(randomUUID()).expect(404);
    await uploaded('not-a-uuid').expect(400);
  });

  // ----- the webhook ---------------------------------------------------------

  it('activates a READY video from a signed webhook and retires the old LOCAL file', async () => {
    const { lessonId } = await bareLesson();
    const local = await localAsset(lessonId);
    const localFile = path.join(videosDir, local.localKey as string);
    expect(existsSync(localFile)).toBe(true);

    const ticket = await processing(lessonId);
    mock.videos.set(ticket.guid, { status: 4, length: 42 });
    const response = await deliver(ticket.guid, 3).expect(200);
    expect(response.body).toEqual({ status: 'applied' });

    // The status was re-fetched with the API key, not trusted from the body.
    const fetches = mock.calls('GET', ticket.guid);
    expect(fetches).toHaveLength(1);
    expect(fetches[0]?.headers.accesskey).toBe(API_KEY);

    expect(await asset(ticket.assetId)).toMatchObject({
      status: 'READY',
      durationSec: 42,
      failureReason: null,
    });
    expect(await activeOf(lessonId)).toBe(ticket.assetId);
    expect(await asset(local.id)).toBeNull();
    expect(existsSync(localFile)).toBe(false);
    expect(
      await prisma.webhookEvent.count({ where: { provider: 'BUNNY' } }),
    ).toBe(1);

    const descriptor = await adminLesson(lessonId);
    expect(descriptor.video).toMatchObject({
      id: ticket.assetId,
      provider: 'BUNNY',
      status: 'READY',
      durationSec: 42,
    });
    expect(descriptor.pendingVideo).toBeNull();
  });

  it('deletes the previous Bunny video when a replacement becomes READY', async () => {
    const { lessonId } = await bareLesson();
    const first = await processing(lessonId, 'one.mp4');
    mock.videos.set(first.guid, { status: 4, length: 10 });
    await deliver(first.guid, 3).expect(200);
    expect(await activeOf(lessonId)).toBe(first.assetId);

    const second = await processing(lessonId, 'two.mp4');
    mock.videos.set(second.guid, { status: 4, length: 20 });
    await deliver(second.guid, 4).expect(200);

    expect(await activeOf(lessonId)).toBe(second.assetId);
    expect(await asset(first.assetId)).toBeNull();
    expect(mock.calls('DELETE', first.guid)).toHaveLength(1);
    expect(mock.calls('DELETE', second.guid)).toHaveLength(0);
    expect(mock.videos.has(first.guid)).toBe(false);
  });

  it('treats a repeated webhook as a no-op', async () => {
    const { lessonId } = await bareLesson();
    const ticket = await processing(lessonId);
    mock.videos.set(ticket.guid, { status: 4, length: 42 });
    const body = bunnyEvent(ticket.guid, 3);
    await webhook(body).expect(200);
    const fetchesAfterFirst = mock.calls('GET', ticket.guid).length;

    const again = await webhook(body).expect(200);
    expect(again.body).toEqual({ status: 'duplicate' });
    expect(mock.calls('GET', ticket.guid)).toHaveLength(fetchesAfterFirst);
    expect(await prisma.webhookEvent.count()).toBe(1);
    expect(await activeOf(lessonId)).toBe(ticket.assetId);
  });

  it('rejects a bad, missing or tampered signature with 401 and writes nothing', async () => {
    const { lessonId } = await bareLesson();
    const ticket = await processing(lessonId);
    mock.videos.set(ticket.guid, { status: 4, length: 42 });
    const body = bunnyEvent(ticket.guid, 3);

    await webhook(body, {
      'X-BunnyStream-Signature': sign(body, 'wrong'),
    }).expect(401);
    await webhook(body, {}).expect(401);
    await webhook(body, { 'X-BunnyStream-Signature': 'short' }).expect(401);
    await webhook(body.replace('3}', '4}'), {
      'X-BunnyStream-Signature': sign(body),
    }).expect(401);
    await webhook(body, {
      'X-BunnyStream-Signature': sign(body),
      'X-BunnyStream-Signature-Version': 'v2',
    }).expect(401);

    expect(await prisma.webhookEvent.count()).toBe(0);
    expect((await asset(ticket.assetId))?.status).toBe('PROCESSING');
    expect(await activeOf(lessonId)).toBeNull();
    expect(mock.calls('GET', ticket.guid)).toHaveLength(0);
  });

  it('accepts the sha256= and v1, signature prefixes', async () => {
    const { lessonId } = await bareLesson();
    for (const prefix of ['sha256=', 'v1,']) {
      const ticket = await processing(lessonId);
      mock.videos.set(ticket.guid, { status: 1, length: 0 });
      const body = bunnyEvent(ticket.guid, 1);
      await webhook(body, {
        'X-BunnyStream-Signature': `${prefix}${sign(body)}`,
      }).expect(200);
    }
  });

  it('answers 404 when no webhook secret is configured', async () => {
    const body = bunnyEvent(randomUUID(), 3);
    await webhook(
      body,
      { 'X-BunnyStream-Signature': sign(body) },
      plain.url,
    ).expect(404);
  });

  it('never trusts the webhook status: Bunny still encoding keeps it PROCESSING', async () => {
    const { lessonId } = await bareLesson();
    const ticket = await processing(lessonId);
    mock.videos.set(ticket.guid, { status: 2, length: 0 });
    const body = bunnyEvent(ticket.guid, 3);
    const first = await webhook(body).expect(200);
    expect(first.body).toEqual({ status: 'ignored' });
    expect((await asset(ticket.assetId))?.status).toBe('PROCESSING');
    expect(await activeOf(lessonId)).toBeNull();
    expect(await prisma.webhookEvent.count()).toBe(0);

    // Once Bunny really is done, the same delivery is not swallowed as a dupe.
    mock.videos.set(ticket.guid, { status: 4, length: 7 });
    await webhook(body).expect(200);
    expect(await activeOf(lessonId)).toBe(ticket.assetId);
  });

  it('acknowledges a foreign library and unknown videos without acting', async () => {
    const { lessonId } = await bareLesson();
    const ticket = await processing(lessonId);
    mock.videos.set(ticket.guid, { status: 4, length: 42 });

    const foreign = await webhook(bunnyEvent(ticket.guid, 3, '9999')).expect(
      200,
    );
    expect(foreign.body).toEqual({ status: 'ignored' });
    const unknown = await deliver(randomUUID(), 3).expect(200);
    expect(unknown.body).toEqual({ status: 'ignored' });
    const irrelevant = await deliver(ticket.guid, 9).expect(200);
    expect(irrelevant.body).toEqual({ status: 'ignored' });
    const shape = '{"hello":"world"}';
    await webhook(shape).expect(200);

    expect(mock.calls('GET')).toHaveLength(0);
    expect((await asset(ticket.assetId))?.status).toBe('PROCESSING');
    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  it('ignores an event older than the asset’s last applied event', async () => {
    const { lessonId } = await bareLesson();
    const ticket = await processing(lessonId);
    mock.videos.set(ticket.guid, { status: 4, length: 42 });
    await prisma.videoAsset.update({
      where: { id: ticket.assetId },
      data: { lastEventAt: new Date(Date.now() + 3_600_000) },
    });
    const response = await deliver(ticket.guid, 3).expect(200);
    expect(response.body).toEqual({ status: 'stale' });
    expect((await asset(ticket.assetId))?.status).toBe('PROCESSING');
    expect(await activeOf(lessonId)).toBeNull();
    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  it('never lets a late READY of an older upload replace the newer active video', async () => {
    const { lessonId } = await bareLesson();
    const older = await processing(lessonId, 'older.mp4');
    const newer = await processing(lessonId, 'newer.mp4');
    mock.videos.set(newer.guid, { status: 4, length: 20 });
    await deliver(newer.guid, 3).expect(200);
    expect(await activeOf(lessonId)).toBe(newer.assetId);

    mock.videos.set(older.guid, { status: 4, length: 10 });
    await deliver(older.guid, 3).expect(200);
    expect(await activeOf(lessonId)).toBe(newer.assetId);
    expect(await asset(older.assetId)).toBeNull();
    expect(mock.calls('DELETE', older.guid)).toHaveLength(1);
    expect(mock.calls('DELETE', newer.guid)).toHaveLength(0);
    expect((await asset(newer.assetId))?.status).toBe('READY');
  });

  it('keeps a FAILED asset with its reason beside the active video', async () => {
    const { lessonId } = await bareLesson();
    const good = await processing(lessonId, 'good.mp4');
    mock.videos.set(good.guid, { status: 4, length: 5 });
    await deliver(good.guid, 3).expect(200);

    const bad = await processing(lessonId, 'bad.mp4');
    mock.videos.set(bad.guid, { status: 5, length: 0 });
    await deliver(bad.guid, 5).expect(200);

    expect(await asset(bad.assetId)).toMatchObject({
      status: 'FAILED',
      failureReason: 'encoding-failed',
    });
    expect(await activeOf(lessonId)).toBe(good.assetId);
    const descriptor = await adminLesson(lessonId);
    expect(descriptor.video).toMatchObject({ id: good.assetId });
    expect(descriptor.pendingVideo).toMatchObject({
      id: bad.assetId,
      status: 'FAILED',
      failureReason: 'encoding-failed',
    });

    // A later successful replacement clears the failed attempt.
    const retry = await processing(lessonId, 'retry.mp4');
    mock.videos.set(retry.guid, { status: 4, length: 6 });
    await deliver(retry.guid, 3).expect(200);
    expect(await asset(bad.assetId)).toBeNull();
    expect(await activeOf(lessonId)).toBe(retry.assetId);
    expect((await adminLesson(lessonId)).pendingVideo).toBeNull();
  });

  // ----- the reconciler ------------------------------------------------------

  it('reconcile moves PROCESSING to READY and gives up on abandoned uploads', async () => {
    const { lessonId: processingLesson } = await bareLesson();
    const finished = await processing(processingLesson);
    mock.videos.set(finished.guid, { status: 4, length: 61 });

    const { lessonId: uploadLesson } = await bareLesson();
    const abandoned = await startUpload(uploadLesson, 'old.mp4');
    const stalled = await startUpload(uploadLesson, 'stalled.mp4');
    const fresh = await startUpload(uploadLesson, 'fresh.mp4');
    const minutesAgo = (minutes: number) =>
      new Date(Date.now() - minutes * 60_000);
    await prisma.videoAsset.update({
      where: { id: abandoned.assetId },
      data: { createdAt: minutesAgo(25 * 60) },
    });
    await prisma.videoAsset.update({
      where: { id: stalled.assetId },
      data: { createdAt: minutesAgo(30) },
    });
    mock.videos.set(stalled.guid, { status: 1, length: 0 });

    const result = await api.reconcile();
    expect(result).toMatchObject({ applied: 2, abandoned: 1 });

    expect(await asset(finished.assetId)).toMatchObject({
      status: 'READY',
      durationSec: 61,
    });
    expect(await activeOf(processingLesson)).toBe(finished.assetId);

    expect(await asset(abandoned.assetId)).toMatchObject({
      status: 'FAILED',
      failureReason: 'upload-abandoned',
    });
    expect(mock.calls('DELETE', abandoned.guid)).toHaveLength(1);

    // Upload looks finished to Bunny even though the browser never said so.
    expect((await asset(stalled.assetId))?.status).toBe('PROCESSING');
    // Recent uploads are left to the browser.
    expect((await asset(fresh.assetId))?.status).toBe('UPLOADING');
    expect(mock.calls('GET', fresh.guid)).toHaveLength(0);

    // Nothing left to do on the next pass except the stalled video.
    const again = await api.reconcile();
    expect(again).toMatchObject({ applied: 0, abandoned: 0 });
  });

  it('reconcile fails a PROCESSING video that Bunny no longer has', async () => {
    const { lessonId } = await bareLesson();
    const ticket = await processing(lessonId);
    mock.videos.delete(ticket.guid);
    await api.reconcile();
    expect(await asset(ticket.assetId)).toMatchObject({
      status: 'FAILED',
      failureReason: 'video-missing',
    });
  });

  // ----- playback and streaming ----------------------------------------------

  it('hands out a signed embed with the same access matrix as LOCAL', async () => {
    const f = await seed('bunny-playback');
    const previewAsset = await processing(f.preview);
    const lockedAsset = await processing(f.locked);
    const hiddenAsset = await processing(f.hidden);
    for (const ticket of [previewAsset, lockedAsset, hiddenAsset]) {
      mock.videos.set(ticket.guid, { status: 4, length: 33 });
      await deliver(ticket.guid, 3).expect(200);
    }
    const { agent: student, id: studentId } = await signIn(
      'bunny-pb@example.com',
      Role.STUDENT,
    );
    const playback = (agent: Agent | undefined, lessonId: string) =>
      call(agent, 'get', `/api/v1/lessons/${lessonId}/playback`);

    await playback(undefined, f.preview).expect(401);
    const free = await playback(student, f.preview).expect(200);
    expect(free.headers['cache-control']).toBe('private, no-store');
    const video = (free.body as { video: Json }).video;
    expect(video).toMatchObject({ provider: 'BUNNY', durationSec: 33 });
    expect(Object.keys(video).sort()).toEqual(
      ['durationSec', 'embedUrl', 'expiresAt', 'provider'].sort(),
    );
    const url = new URL(video.embedUrl as string);
    expect(`${url.origin}${url.pathname}`).toBe(
      `${mock.baseUrl}/embed/${LIBRARY_ID}/${previewAsset.guid}`,
    );
    const expires = Number(url.searchParams.get('expires'));
    expect(url.searchParams.get('token')).toBe(
      sha256(`${TOKEN_KEY}${previewAsset.guid}${expires}`),
    );
    expect(url.searchParams.get('autoplay')).toBe('false');
    expect(url.searchParams.get('preload')).toBe('true');
    expect(url.searchParams.get('responsive')).toBe('true');
    expect(video.expiresAt).toBe(new Date(expires * 1000).toISOString());
    const now = Math.floor(Date.now() / 1000);
    expect(expires).toBeGreaterThanOrEqual(now + EMBED_TTL - 30);
    expect(expires).toBeLessThanOrEqual(now + EMBED_TTL + 30);
    expect(JSON.stringify(free.body)).not.toContain(TOKEN_KEY);
    expect(JSON.stringify(free.body)).not.toContain(API_KEY);

    await playback(undefined, f.locked).expect(401);
    const accountAccess = await playback(student, f.locked).expect(200);
    expect((accountAccess.body as { video: Json }).video.provider).toBe(
      'BUNNY',
    );
    await playback(undefined, f.hidden).expect(404);
    await playback(student, f.hidden).expect(404);
    await playback(undefined, randomUUID()).expect(404);
    const staff = await playback(admin, f.hidden).expect(200);
    expect((staff.body as { video: Json }).video.provider).toBe('BUNNY');

    await call(admin, 'post', `/api/v1/admin/students/${studentId}/enrollments`)
      .send({ levelId: f.levelId })
      .expect(201);
    const enrolled = await playback(student, f.locked).expect(200);
    expect(
      new URL((enrolled.body as { video: { embedUrl: string } }).video.embedUrl)
        .pathname,
    ).toBe(`/embed/${LIBRARY_ID}/${lockedAsset.guid}`);
    await call(
      admin,
      'delete',
      `/api/v1/admin/students/${studentId}/enrollments/${f.levelId}`,
    )
      .send({})
      .expect(204);
    await playback(student, f.locked).expect(200);
  });

  it('answers 404 no-video while the only upload is still processing', async () => {
    const f = await seed('bunny-novideo');
    await processing(f.preview);
    const { agent: student } = await signIn(
      'bunny-novideo-student@example.com',
      Role.STUDENT,
    );
    const response = await call(
      student,
      'get',
      `/api/v1/lessons/${f.preview}/playback`,
    ).expect(404);
    expect(response.body).toMatchObject({ reason: 'no-video' });
  });

  it('keeps LOCAL assets streaming after Bunny is configured, and never streams BUNNY ones', async () => {
    const f = await seed('bunny-local-stream');
    const local = await localAsset(f.preview);
    const { agent: student } = await signIn(
      'bunny-local-student@example.com',
      Role.STUDENT,
    );
    const playback = await call(
      student,
      'get',
      `/api/v1/lessons/${f.preview}/playback`,
    ).expect(200);
    expect(playback.body).toMatchObject({
      video: {
        provider: 'LOCAL',
        src: `/api/v1/videos/${local.id}/stream`,
        mime: 'video/mp4',
      },
    });
    const stream = await call(
      student,
      'get',
      `/api/v1/videos/${local.id}/stream`,
    )
      .set('Range', 'bytes=0-9')
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(stream.status).toBe(206);
    expect((stream.body as Buffer).length).toBe(10);

    // A Bunny asset has no local file: the stream route answers 404.
    const bunny = await processing(f.preview);
    await call(admin, 'get', `/api/v1/videos/${bunny.assetId}/stream`).expect(
      404,
    );
    mock.videos.set(bunny.guid, { status: 4, length: 5 });
    await deliver(bunny.guid, 3).expect(200);
    await call(admin, 'get', `/api/v1/videos/${bunny.assetId}/stream`).expect(
      404,
    );
  });

  // ----- removal -------------------------------------------------------------

  it('removing a lesson video also deletes its pending Bunny uploads', async () => {
    const { lessonId } = await bareLesson();
    const active = await processing(lessonId, 'active.mp4');
    mock.videos.set(active.guid, { status: 4, length: 5 });
    await deliver(active.guid, 3).expect(200);
    const pending = await processing(lessonId, 'pending.mp4');
    const failed = await startUpload(lessonId, 'failed.mp4');
    await prisma.videoAsset.update({
      where: { id: failed.assetId },
      data: { status: 'FAILED', failureReason: 'upload-failed' },
    });

    await call(
      admin,
      'delete',
      `/api/v1/admin/lessons/${lessonId}/video`,
    ).expect(204);
    expect(await prisma.videoAsset.count({ where: { lessonId } })).toBe(0);
    for (const ticket of [active, pending, failed]) {
      expect(mock.calls('DELETE', ticket.guid)).toHaveLength(1);
    }
    // Idempotent.
    await call(
      admin,
      'delete',
      `/api/v1/admin/lessons/${lessonId}/video`,
    ).expect(204);
  });

  it('deleting a published lesson deletes its Bunny videos', async () => {
    const { lessonId } = await bareLesson();
    const pending = await processing(lessonId);
    await call(
      admin,
      'post',
      `/api/v1/admin/lessons/${lessonId}/publish`,
    ).expect(200);
    await call(admin, 'delete', `/api/v1/admin/lessons/${lessonId}`).expect(
      204,
    );
    expect(await prisma.videoAsset.count()).toBe(0);
    expect(mock.calls('DELETE', pending.guid)).toHaveLength(1);
  });

  // ----- diagnostics ---------------------------------------------------------

  it('reports provider, counts and the last webhook without secrets', async () => {
    const empty = await call(
      admin,
      'get',
      '/api/v1/admin/diagnostics/video',
    ).expect(200);
    expect(empty.body).toMatchObject({
      active: 'BUNNY',
      bunny: { configured: true, missing: [] },
      devOnly: false,
      counts: { local: 0, bunny: 0, processing: 0, failed: 0 },
      lastWebhookAt: null,
    });

    const { lessonId } = await bareLesson();
    await localAsset(lessonId);
    const { lessonId: other } = await bareLesson();
    const ready = await processing(other);
    mock.videos.set(ready.guid, { status: 4, length: 5 });
    await deliver(ready.guid, 3).expect(200);
    await processing(other);
    const bad = await startUpload(other, 'bad.mp4');
    await prisma.videoAsset.update({
      where: { id: bad.assetId },
      data: { status: 'FAILED', failureReason: 'upload-failed' },
    });

    const response = await call(
      admin,
      'get',
      '/api/v1/admin/diagnostics/video',
    ).expect(200);
    expect(response.body).toMatchObject({
      counts: { local: 1, bunny: 3, processing: 1, failed: 1 },
    });
    expect(
      Date.parse((response.body as { lastWebhookAt: string }).lastWebhookAt),
    ).toBeGreaterThan(Date.now() - 60_000);
    const text = JSON.stringify(response.body);
    for (const secret of [API_KEY, TOKEN_KEY, WEBHOOK_SECRET, LIBRARY_ID]) {
      expect(text).not.toContain(secret);
    }

    const local = await call(
      await plainAdmin(),
      'get',
      '/api/v1/admin/diagnostics/video',
    );
    expect(local.body).toMatchObject({
      active: 'LOCAL',
      bunny: { configured: false, missing: expect.any(Array) as unknown },
    });
  });
});
