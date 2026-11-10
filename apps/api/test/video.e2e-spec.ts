import { spawnSync } from 'node:child_process';
import { fork, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import {
  copyFile,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { Role } from '@app/shared';

import { PrismaClient } from '../src/generated/prisma/client';

const origin = 'http://localhost:3000';
const password = 'initial-password';
/** Small enough to trip in a test, large enough for the ffmpeg fixtures. */
const VIDEO_MAX_BYTES = 200_000;

type Agent = ReturnType<typeof request.agent>;
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head';
type Json = Record<string, unknown>;

const hasFfmpeg =
  spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
if (!hasFfmpeg) {
  console.warn(
    'ffmpeg was not found on PATH: the tests that need a real MP4/WebM fixture are skipped.',
  );
}
const withFfmpeg = hasFfmpeg ? it : it.skip;

const isEmpty = (body: unknown): boolean =>
  Buffer.isBuffer(body)
    ? body.length === 0
    : Object.keys(body as object).length === 0;

function binary(
  response: request.Response,
  done: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => done(null, Buffer.concat(chunks)));
}

describe('local video (e2e)', () => {
  let apiUrl: string;
  let child: ChildProcess;
  let childOutput = '';
  let prisma: PrismaClient;
  let uploadsDir: string;
  let videosDir: string;
  let fixtureDir: string;
  let mp4: Buffer;
  let webm: Buffer;
  let admin: Agent;
  let ipCounter = 0;
  let phoneCounter = 0;

  function call(agent: Agent | undefined, method: Method, route: string) {
    ipCounter += 1;
    const target = agent
      ? agent[method](route)
      : request(apiUrl)[method](route);
    return target
      .set('Origin', origin)
      .set(
        'X-Forwarded-For',
        `198.51.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`,
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
        name: 'Video User',
        phone: `+2010${String(2_000_000 + phoneCounter)}`,
      })
      .expect(201);
    const user = await prisma.user.update({ where: { email }, data: { role } });
    await call(agent, 'post', '/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return { agent, id: user.id };
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

  const uploadTo = (
    agent: Agent | undefined,
    lessonId: string,
    data: Buffer,
    filename = 'lesson.mp4',
    fields: Record<string, string> = {},
  ) => {
    let req = call(
      agent,
      'post',
      `/api/v1/admin/lessons/${lessonId}/videos/local`,
    );
    for (const [key, value] of Object.entries(fields))
      req = req.field(key, value);
    return req.attach('file', data, { filename, contentType: 'video/mp4' });
  };

  async function uploadOk(
    lessonId: string,
    data: Buffer,
    filename?: string,
    fields?: Record<string, string>,
  ): Promise<Json> {
    const response = await uploadTo(admin, lessonId, data, filename, fields);
    expect(response.status).toBe(201);
    return response.body as Json;
  }

  const files = async (): Promise<string[]> =>
    (await readdir(videosDir)).sort();

  function streamOf(
    agent: Agent | undefined,
    assetId: string,
    method: 'get' | 'head' = 'get',
    range?: string,
  ) {
    let req = call(agent, method, `/api/v1/videos/${assetId}/stream`);
    if (range !== undefined) req = req.set('Range', range);
    return req.buffer(true).parse(binary);
  }

  /** A published level with a free preview, a locked and an unpublished lesson. */
  async function seed(slug: string): Promise<{
    levelId: string;
    preview: string;
    locked: string;
    hidden: string;
  }> {
    const levelId = await createLevel(slug);
    const preview = await createLesson(levelId, 'Preview', {
      isFreePreview: true,
      hanzi: '你好',
    });
    const locked = await createLesson(levelId, 'Locked');
    const hidden = await createLesson(levelId, 'Hidden');
    await publish('lessons', preview);
    await publish('lessons', locked);
    await publish('levels', levelId);
    return { levelId, preview, locked, hidden };
  }

  async function clean(): Promise<void> {
    await prisma.enrollment.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.level.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    for (const name of await readdir(videosDir)) {
      await rm(path.join(videosDir, name), { force: true });
    }
  }

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'cl-video-spec-'));
    videosDir = path.join(uploadsDir, 'videos');
    fixtureDir = await mkdtemp(path.join(tmpdir(), 'cl-video-fixtures-'));

    if (hasFfmpeg) {
      const render = (name: string, args: string[]): Buffer => {
        const out = path.join(fixtureDir, name);
        const result = spawnSync(
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
            ...args,
            out,
          ],
          { encoding: 'utf8' },
        );
        if (result.status !== 0) {
          throw new Error(`ffmpeg failed for ${name}: ${result.stderr}`);
        }
        return readFileSync(out);
      };
      mp4 = render('fixture.mp4', ['-pix_fmt', 'yuv420p']);
      webm = render('fixture.webm', ['-c:v', 'libvpx', '-b:v', '150k']);
      expect(mp4.length).toBeLessThan(VIDEO_MAX_BYTES);
      expect(webm.length).toBeLessThan(VIDEO_MAX_BYTES);
    }

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    child = fork('test/test-server.ts', {
      cwd: process.cwd(),
      execArgv: ['--import', 'tsx'],
      env: {
        ...process.env,
        UPLOADS_DIR: uploadsDir,
        VIDEO_MAX_BYTES: String(VIDEO_MAX_BYTES),
      },
      silent: true,
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      childOutput += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      childOutput += chunk.toString();
    });
    const port = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Test API timed out. Output:\n${childOutput}`)),
        15_000,
      );
      child.on('message', (message: { type: string; port?: number }) => {
        if (message.type === 'ready' && message.port) {
          clearTimeout(timeout);
          resolve(message.port);
        }
      });
      child.once('exit', (code) =>
        reject(new Error(`Test API exited (${code}). Output:\n${childOutput}`)),
      );
    });
    apiUrl = `http://127.0.0.1:${port}`;
  });

  beforeEach(async () => {
    await clean();
    phoneCounter = 0;
    const signedIn = await signIn('video-admin@example.com', Role.ADMIN);
    admin = signedIn.agent;
  });

  afterAll(async () => {
    if (prisma) {
      await clean();
      await prisma.$disconnect();
    }
    if (child?.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    }
    if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true });
    if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
  });

  // ----- boot, access and validation (no ffmpeg needed) ----------------------

  it('creates the private videos directory at boot and never serves it', async () => {
    expect(existsSync(videosDir)).toBe(true);
    await writeFile(path.join(videosDir, 'probe.mp4'), Buffer.from('x'));
    for (const route of [
      '/media/probe.mp4',
      '/media/../videos/probe.mp4',
      '/videos/probe.mp4',
      '/api/v1/videos/probe.mp4',
    ]) {
      expect(
        (await call(undefined, 'get', route)).status,
      ).toBeGreaterThanOrEqual(400);
    }
  });

  it('keeps the admin routes behind authentication and the admin role', async () => {
    const { levelId } = { levelId: await createLevel('video-auth') };
    const lessonId = await createLesson(levelId, 'Lesson');
    const { agent: student } = await signIn(
      'video-student@example.com',
      Role.STUDENT,
    );
    const fake = Buffer.from('....ftypisom');

    await uploadTo(undefined, lessonId, fake).expect(401);
    await uploadTo(student, lessonId, fake).expect(403);
    await call(
      undefined,
      'delete',
      `/api/v1/admin/lessons/${lessonId}/video`,
    ).expect(401);
    await call(
      student,
      'delete',
      `/api/v1/admin/lessons/${lessonId}/video`,
    ).expect(403);
    await call(undefined, 'get', '/api/v1/admin/diagnostics/video').expect(401);
    await call(student, 'get', '/api/v1/admin/diagnostics/video').expect(403);
    expect(await files()).toEqual([]);
  });

  it('rejects a file whose bytes are not MP4 or WebM with 415 and leaves nothing behind', async () => {
    const lessonId = await createLesson(
      await createLevel('video-415'),
      'Lesson',
    );
    const text = Buffer.from('this is plainly not a video '.repeat(20));
    const response = await uploadTo(admin, lessonId, text, 'fake.mp4');
    expect(response.status).toBe(415);
    expect(await files()).toEqual([]);
    expect(await prisma.videoAsset.count()).toBe(0);
    const lesson = await prisma.lesson.findUniqueOrThrow({
      where: { id: lessonId },
    });
    expect(lesson.activeVideoId).toBeNull();
  });

  it('answers 413 above VIDEO_MAX_BYTES and removes the partial temp file', async () => {
    const lessonId = await createLesson(
      await createLevel('video-413'),
      'Lesson',
    );
    const big = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from('ftypisom'),
      Buffer.alloc(VIDEO_MAX_BYTES + 50_000),
    ]);
    const response = await uploadTo(admin, lessonId, big);
    expect(response.status).toBe(413);
    expect(await files()).toEqual([]);
    expect(await prisma.videoAsset.count()).toBe(0);
  });

  it('validates the request: missing file, bad duration, unknown lesson', async () => {
    const lessonId = await createLesson(
      await createLevel('video-400'),
      'Lesson',
    );
    const route = `/api/v1/admin/lessons/${lessonId}/videos/local`;
    const header = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from('ftypisom'),
    ]);

    await call(admin, 'post', route).field('durationSec', '5').expect(400);
    for (const bad of ['0', '36001', '1.5', 'abc']) {
      await uploadTo(admin, lessonId, header, 'a.mp4', {
        durationSec: bad,
      }).expect(400);
    }
    await call(admin, 'post', '/api/v1/admin/lessons/not-a-uuid/videos/local')
      .attach('file', header, { filename: 'a.mp4' })
      .expect(400);
    const missing = '11111111-1111-4111-8111-111111111111';
    await uploadTo(admin, missing, header).expect(404);
    await call(
      admin,
      'delete',
      `/api/v1/admin/lessons/${missing}/video`,
    ).expect(404);
    expect(await files()).toEqual([]);
    expect(await prisma.videoAsset.count()).toBe(0);
  });

  it('reports provider readiness without secrets', async () => {
    const response = await call(
      admin,
      'get',
      '/api/v1/admin/diagnostics/video',
    ).expect(200);
    expect(response.body).toEqual({
      bunny: {
        configured: false,
        missing: [
          'BUNNY_LIBRARY_ID',
          'BUNNY_API_KEY',
          'BUNNY_TOKEN_KEY',
          'BUNNY_WEBHOOK_SECRET',
          'BUNNY_CDN_HOST',
        ],
      },
      active: 'LOCAL',
      devOnly: false,
      // Added in M7 (the diagnostics page).
      counts: { local: 0, bunny: 0, processing: 0, failed: 0 },
      lastWebhookAt: null,
    });
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('answers CORS for the upload route only, only for APP_URL, and only with credentials', async () => {
    const route =
      '/api/v1/admin/lessons/11111111-1111-4111-8111-111111111111/videos/local';
    const allowed = await request(apiUrl)
      .options(route)
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(origin);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(allowed.headers['access-control-allow-methods']).toContain('POST');
    expect(allowed.headers.vary).toContain('Origin');

    const foreign = await request(apiUrl)
      .options(route)
      .set('Origin', 'http://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    expect(foreign.headers['access-control-allow-credentials']).toBeUndefined();

    // The real POST carries the headers too (here refused for being anonymous).
    const post = await uploadTo(
      undefined,
      '11111111-1111-4111-8111-111111111111',
      Buffer.from('x'),
    );
    expect(post.status).toBe(401);
    expect(post.headers['access-control-allow-origin']).toBe(origin);

    // No other route is opened up.
    const other = await request(apiUrl)
      .options('/api/v1/admin/levels')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  // ----- real fixtures -------------------------------------------------------

  describe('uploads', () => {
    withFfmpeg(
      'stores an MP4 as the READY active video, atomically on disk',
      async () => {
        const lessonId = await createLesson(
          await createLevel('video-up-mp4'),
          'Lesson',
        );
        const body = await uploadOk(lessonId, mp4, 'my lesson.mp4', {
          durationSec: '2',
        });
        expect(Object.keys(body).sort()).toEqual(
          [
            'createdAt',
            'devOnly',
            'durationSec',
            'id',
            'mime',
            'originalName',
            'provider',
            'sizeBytes',
            'status',
          ].sort(),
        );
        expect(body).toMatchObject({
          provider: 'LOCAL',
          status: 'READY',
          mime: 'video/mp4',
          sizeBytes: mp4.length,
          durationSec: 2,
          originalName: 'my lesson.mp4',
          devOnly: false,
        });
        expect(typeof body.sizeBytes).toBe('number');

        const id = body.id as string;
        expect(await files()).toEqual([`${id}.mp4`]);
        expect(await readFile(path.join(videosDir, `${id}.mp4`))).toEqual(mp4);
        const row = await prisma.videoAsset.findUniqueOrThrow({
          where: { id },
        });
        expect(row).toMatchObject({
          lessonId,
          provider: 'LOCAL',
          status: 'READY',
          localKey: `${id}.mp4`,
          mime: 'video/mp4',
          sizeBytes: BigInt(mp4.length),
        });
        const lesson = await prisma.lesson.findUniqueOrThrow({
          where: { id: lessonId },
        });
        expect(lesson.activeVideoId).toBe(id);

        const detail = await call(
          admin,
          'get',
          `/api/v1/admin/lessons/${lessonId}`,
        ).expect(200);
        expect((detail.body as Json).video).toEqual({
          id,
          provider: 'LOCAL',
          status: 'READY',
          mime: 'video/mp4',
          sizeBytes: mp4.length,
          durationSec: 2,
          originalName: 'my lesson.mp4',
          createdAt: row.createdAt.toISOString(),
        });
      },
    );

    withFfmpeg(
      'stores a WebM, and a lesson without a video reports null',
      async () => {
        const levelId = await createLevel('video-up-webm');
        const lessonId = await createLesson(levelId, 'Lesson');
        const empty = await createLesson(levelId, 'Empty');
        const body = await uploadOk(lessonId, webm, 'clip.webm');
        expect(body).toMatchObject({ mime: 'video/webm', durationSec: null });
        expect(await files()).toEqual([`${body.id as string}.webm`]);
        const none = await call(
          admin,
          'get',
          `/api/v1/admin/lessons/${empty}`,
        ).expect(200);
        expect((none.body as Json).video).toBeNull();
        const level = await call(
          admin,
          'get',
          `/api/v1/admin/levels/${levelId}`,
        ).expect(200);
        const lessons = (
          level.body as { lessons: { id: string; video: Json | null }[] }
        ).lessons;
        expect(
          lessons.find((lesson) => lesson.id === lessonId)?.video?.id,
        ).toBe(body.id);
      },
    );

    withFfmpeg(
      'replacing deletes the previous asset row and its file',
      async () => {
        const lessonId = await createLesson(
          await createLevel('video-up-replace'),
          'Lesson',
        );
        const first = await uploadOk(lessonId, mp4);
        const second = await uploadOk(lessonId, webm, 'second.webm');
        expect(second.id).not.toBe(first.id);
        expect(await files()).toEqual([`${second.id as string}.webm`]);
        expect(await prisma.videoAsset.count()).toBe(1);
        const lesson = await prisma.lesson.findUniqueOrThrow({
          where: { id: lessonId },
        });
        expect(lesson.activeVideoId).toBe(second.id);
        // The old asset no longer streams.
        await streamOf(admin, first.id as string).expect(404);
      },
    );

    withFfmpeg(
      'DELETE clears the video, row and file, and is idempotent',
      async () => {
        const lessonId = await createLesson(
          await createLevel('video-up-delete'),
          'Lesson',
        );
        await uploadOk(lessonId, mp4);
        await call(
          admin,
          'delete',
          `/api/v1/admin/lessons/${lessonId}/video`,
        ).expect(204);
        expect(await files()).toEqual([]);
        expect(await prisma.videoAsset.count()).toBe(0);
        const lesson = await prisma.lesson.findUniqueOrThrow({
          where: { id: lessonId },
        });
        expect(lesson.activeVideoId).toBeNull();
        await call(
          admin,
          'delete',
          `/api/v1/admin/lessons/${lessonId}/video`,
        ).expect(204);
      },
    );

    withFfmpeg(
      'deleting a never-published lesson removes its video file',
      async () => {
        const lessonId = await createLesson(
          await createLevel('video-up-lesson-delete'),
          'Lesson',
        );
        await uploadOk(lessonId, mp4);
        await call(admin, 'delete', `/api/v1/admin/lessons/${lessonId}`).expect(
          204,
        );
        expect(await files()).toEqual([]);
        expect(await prisma.videoAsset.count()).toBe(0);
      },
    );
  });

  // ----- playback and streaming ---------------------------------------------

  describe('playback and streaming', () => {
    interface Fixture {
      levelId: string;
      slug: string;
      preview: string;
      locked: string;
      hidden: string;
      previewAsset: string;
      lockedAsset: string;
      hiddenAsset: string;
    }

    async function seedWithVideos(slug: string): Promise<Fixture> {
      const base = await seed(slug);
      const previewAsset = (await uploadOk(base.preview, mp4)).id as string;
      const lockedAsset = (await uploadOk(base.locked, webm, 'b.webm'))
        .id as string;
      const hiddenAsset = (await uploadOk(base.hidden, mp4)).id as string;
      return { ...base, slug, previewAsset, lockedAsset, hiddenAsset };
    }

    withFfmpeg('answers the playback descriptor for every viewer', async () => {
      const f = await seedWithVideos('video-playback');
      const { agent: student, id: studentId } = await signIn(
        'pb-student@example.com',
        Role.STUDENT,
      );
      const playback = (agent: Agent | undefined, lessonId: string) =>
        call(agent, 'get', `/api/v1/lessons/${lessonId}/playback`);

      // Anonymous on the free preview.
      const free = await playback(undefined, f.preview).expect(200);
      expect(free.headers['cache-control']).toBe('private, no-store');
      expect(free.body).toMatchObject({
        lesson: {
          id: f.preview,
          number: 1,
          hanzi: '你好',
          title: { en: 'Preview' },
          description: null,
        },
        level: { slug: f.slug, hanzi: '入门' },
        video: {
          provider: 'LOCAL',
          src: `/api/v1/videos/${f.previewAsset}/stream`,
          mime: 'video/mp4',
          durationSec: null,
        },
        poster: null,
        siblings: [
          { id: f.preview, number: 1, access: 'preview' },
          { id: f.locked, number: 2, access: 'locked' },
        ],
      });
      expect(Object.keys(free.body as Json).sort()).toEqual(
        ['level', 'lesson', 'poster', 'siblings', 'video'].sort(),
      );

      // Anonymous on a locked lesson, then signed in but not enrolled.
      const login = await playback(undefined, f.locked).expect(401);
      expect(login.body).toMatchObject({ reason: 'login-required' });
      expect(login.headers['cache-control']).toBe('private, no-store');
      const notEnrolled = await playback(student, f.locked).expect(403);
      expect(notEnrolled.body).toMatchObject({
        reason: 'not-enrolled',
        levelSlug: f.slug,
      });
      expect(notEnrolled.headers['cache-control']).toBe('private, no-store');

      // Unpublished lessons are a 404 for everyone but staff.
      await playback(undefined, f.hidden).expect(404);
      await playback(student, f.hidden).expect(404);
      await playback(undefined, '11111111-1111-4111-8111-111111111111').expect(
        404,
      );
      const staff = await playback(admin, f.hidden).expect(200);
      expect(staff.body).toMatchObject({ lesson: { id: f.hidden, number: 3 } });

      // Enrolled, then revoked.
      await call(
        admin,
        'post',
        `/api/v1/admin/students/${studentId}/enrollments`,
      )
        .send({ levelId: f.levelId })
        .expect(201);
      const enrolled = await playback(student, f.locked).expect(200);
      expect(enrolled.body).toMatchObject({
        video: {
          src: `/api/v1/videos/${f.lockedAsset}/stream`,
          mime: 'video/webm',
        },
        siblings: [
          { id: f.preview, access: 'open' },
          { id: f.locked, access: 'open' },
        ],
      });
      await call(
        admin,
        'delete',
        `/api/v1/admin/students/${studentId}/enrollments/${f.levelId}`,
      )
        .send({})
        .expect(204);
      await playback(student, f.locked).expect(403);
    });

    withFfmpeg(
      'answers 404 no-video, with the lesson text, when nothing is attached',
      async () => {
        const base = await seed('video-novideo');
        const response = await call(
          undefined,
          'get',
          `/api/v1/lessons/${base.preview}/playback`,
        ).expect(404);
        expect(response.body).toMatchObject({
          reason: 'no-video',
          lesson: { id: base.preview, title: { en: 'Preview' } },
          level: { slug: 'video-novideo' },
          siblings: [{ id: base.preview }, { id: base.locked }],
        });
        expect((response.body as Json).video).toBeUndefined();
      },
    );

    withFfmpeg('applies the access matrix to the byte stream', async () => {
      const f = await seedWithVideos('video-matrix');
      const { agent: student, id: studentId } = await signIn(
        'st-student@example.com',
        Role.STUDENT,
      );

      // Free preview: anonymous gets 200 and 206.
      const full = await streamOf(undefined, f.previewAsset).expect(200);
      expect(full.body).toEqual(mp4);
      await streamOf(undefined, f.previewAsset, 'get', 'bytes=0-9').expect(206);

      // Locked: 401 anonymous, 403 not enrolled.
      await streamOf(undefined, f.lockedAsset).expect(401);
      await streamOf(undefined, f.lockedAsset, 'head').expect(401);
      await streamOf(student, f.lockedAsset).expect(403);
      await streamOf(student, f.lockedAsset, 'get', 'bytes=0-9').expect(403);

      // Enrolled: ranges work.
      await call(
        admin,
        'post',
        `/api/v1/admin/students/${studentId}/enrollments`,
      )
        .send({ levelId: f.levelId })
        .expect(201);
      const part = await streamOf(
        student,
        f.lockedAsset,
        'get',
        'bytes=0-9',
      ).expect(206);
      expect(part.body).toEqual(webm.subarray(0, 10));
      expect(part.headers['content-type']).toBe('video/webm');

      // Revoked: refused again on the very next request.
      await call(
        admin,
        'delete',
        `/api/v1/admin/students/${studentId}/enrollments/${f.levelId}`,
      )
        .send({})
        .expect(204);
      await streamOf(student, f.lockedAsset, 'get', 'bytes=0-9').expect(403);

      // Unpublished: only the admin.
      await streamOf(undefined, f.hiddenAsset).expect(404);
      await streamOf(student, f.hiddenAsset).expect(404);
      expect((await streamOf(admin, f.hiddenAsset).expect(200)).body).toEqual(
        mp4,
      );

      // Unknown and malformed ids.
      await streamOf(undefined, '11111111-1111-4111-8111-111111111111').expect(
        404,
      );
      await call(undefined, 'get', '/api/v1/videos/not-a-uuid/stream').expect(
        400,
      );
    });

    withFfmpeg(
      "404s an asset that is not the lesson's active READY video, unless admin",
      async () => {
        const f = await seedWithVideos('video-inactive');
        // A leftover (non-active) asset and a still-processing one share a file.
        const stale = await prisma.videoAsset.create({
          data: {
            lessonId: f.preview,
            provider: 'LOCAL',
            status: 'READY',
            localKey: 'stale.mp4',
            mime: 'video/mp4',
            sizeBytes: BigInt(mp4.length),
            originalName: 'stale.mp4',
          },
        });
        await copyFile(
          path.join(fixtureDir, 'fixture.mp4'),
          path.join(videosDir, 'stale.mp4'),
        );
        const processing = await prisma.videoAsset.create({
          data: {
            lessonId: f.preview,
            provider: 'LOCAL',
            status: 'PROCESSING',
            localKey: 'processing.mp4',
            mime: 'video/mp4',
            originalName: 'processing.mp4',
          },
        });
        await copyFile(
          path.join(fixtureDir, 'fixture.mp4'),
          path.join(videosDir, 'processing.mp4'),
        );

        await streamOf(undefined, stale.id).expect(404);
        await streamOf(undefined, processing.id).expect(404);
        await streamOf(admin, processing.id).expect(404);
        expect((await streamOf(admin, stale.id).expect(200)).body).toEqual(mp4);
      },
    );

    withFfmpeg(
      'answers 404 when the stored file has gone missing',
      async () => {
        const f = await seedWithVideos('video-missing');
        await rm(path.join(videosDir, `${f.previewAsset}.mp4`));
        await streamOf(undefined, f.previewAsset).expect(404);
      },
    );

    withFfmpeg('implements Range, HEAD and the 416 headers', async () => {
      const f = await seedWithVideos('video-range');
      const size = mp4.length;
      const get = (range?: string) =>
        streamOf(undefined, f.previewAsset, 'get', range);
      const head = (range?: string) =>
        streamOf(undefined, f.previewAsset, 'head', range);

      const headers = {
        'accept-ranges': 'bytes',
        'content-type': 'video/mp4',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-disposition': 'inline',
      };

      // No Range: 200, the whole body.
      const whole = await get().expect(200);
      expect(whole.headers).toMatchObject(headers);
      expect(whole.headers['content-length']).toBe(String(size));
      expect(whole.headers['content-range']).toBeUndefined();
      expect(whole.body).toEqual(mp4);

      const cases: [string, number, number][] = [
        ['bytes=0-99', 0, 99],
        ['bytes=100-', 100, size - 1],
        ['bytes=-50', size - 50, size - 1],
        ['bytes=0-0', 0, 0],
        [`bytes=${size - 1}-${size - 1}`, size - 1, size - 1],
        [`bytes=${size - 1}-`, size - 1, size - 1],
        ['bytes=-1', size - 1, size - 1],
        [`bytes=10-${size + 5000}`, 10, size - 1],
        [`bytes=-${size + 5000}`, 0, size - 1],
        ['bytes = 20 - 29', 20, 29],
      ];
      for (const [range, start, end] of cases) {
        const response = await get(range).expect(206);
        expect(response.headers).toMatchObject(headers);
        expect(response.headers['content-range']).toBe(
          `bytes ${start}-${end}/${size}`,
        );
        expect(response.headers['content-length']).toBe(
          String(end - start + 1),
        );
        expect(response.body).toEqual(mp4.subarray(start, end + 1));
      }

      // Unsatisfiable: 416 with the size, and no body.
      for (const range of [
        `bytes=${size}-`,
        `bytes=${size + 10}-${size + 20}`,
        'bytes=500-100',
        'bytes=-0',
      ]) {
        const response = await get(range).expect(416);
        expect(response.headers['content-range']).toBe(`bytes */${size}`);
        expect(response.body).toEqual(Buffer.alloc(0));
      }

      // Malformed and multi-range headers are ignored: a plain 200.
      for (const range of [
        'bytes=abc',
        'bytes=0-5,10-20',
        'items=0-5',
        'bytes=-',
        'garbage',
      ]) {
        const response = await get(range).expect(200);
        expect(response.headers['content-length']).toBe(String(size));
        expect(response.body).toEqual(mp4);
      }

      // HEAD: headers only, with and without a Range.
      const headFull = await head().expect(200);
      expect(headFull.headers).toMatchObject(headers);
      expect(headFull.headers['content-length']).toBe(String(size));
      expect(isEmpty(headFull.body)).toBe(true);
      const headPart = await head('bytes=0-9').expect(206);
      expect(headPart.headers['content-range']).toBe(`bytes 0-9/${size}`);
      expect(headPart.headers['content-length']).toBe('10');
      expect(isEmpty(headPart.body)).toBe(true);
      const headBad = await head(`bytes=${size}-`).expect(416);
      expect(headBad.headers['content-range']).toBe(`bytes */${size}`);

      expect(
        (await stat(path.join(videosDir, `${f.previewAsset}.mp4`))).size,
      ).toBe(size);
    });
  });
});
