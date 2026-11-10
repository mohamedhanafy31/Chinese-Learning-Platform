import { fork, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import sharp from 'sharp';
import request from 'supertest';
import { Role } from '@app/shared';

import { PrismaClient } from '../src/generated/prisma/client';

const origin = 'http://localhost:3000';
const credentials = {
  email: 'media-admin@example.com',
  password: 'initial-password',
  name: 'Media Admin',
  phone: '+20 100-123-4567',
};

type Agent = ReturnType<typeof request.agent>;
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Json = Record<string, unknown>;

async function png(
  width: number,
  height: number,
  background = '#1c3f94',
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background },
  })
    .png()
    .toBuffer();
}

describe('media images (e2e)', () => {
  let apiUrl: string;
  let child: ChildProcess;
  let childOutput = '';
  let prisma: PrismaClient;
  let uploadsDir: string;
  let admin: Agent;
  let student: Agent;
  let ipCounter = 0;

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

  async function signIn(email: string, role: Role): Promise<Agent> {
    const agent = request.agent(apiUrl);
    await call(agent, 'post', '/api/v1/auth/register')
      .send({ ...credentials, email })
      .expect(201);
    await prisma.user.update({ where: { email }, data: { role } });
    await call(agent, 'post', '/api/v1/auth/login')
      .send({ email, password: credentials.password })
      .expect(200);
    return agent;
  }

  const upload = (
    agent: Agent | undefined,
    data: Buffer,
    filename = 'picture.png',
    contentType = 'image/png',
  ) =>
    call(agent, 'post', '/api/v1/admin/media/images').attach('file', data, {
      filename,
      contentType,
    });

  async function uploadOk(data: Buffer): Promise<Json> {
    const response = await upload(admin, data).expect(201);
    return response.body as Json;
  }

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'cl-media-spec-'));
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    child = fork('test/test-server.ts', {
      cwd: process.cwd(),
      execArgv: ['--import', 'tsx'],
      env: { ...process.env, UPLOADS_DIR: uploadsDir },
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
    await prisma.lesson.deleteMany();
    await prisma.level.deleteMany();
    await prisma.mediaAsset.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    admin = await signIn('media-admin@example.com', Role.ADMIN);
    student = await signIn('media-student@example.com', Role.STUDENT);
  });

  afterAll(async () => {
    await prisma?.mediaAsset.deleteMany();
    await prisma?.$disconnect();
    if (child?.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    }
    if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true });
  });

  it('creates the images directory at boot', () => {
    expect(existsSync(path.join(uploadsDir, 'images'))).toBe(true);
  });

  it('converts a large PNG to a resized WebP stored on disk and serves it in test mode', async () => {
    const body = await uploadOk(await png(3000, 1500));
    expect(body).toMatchObject({
      width: 2000,
      height: 1000,
      mime: 'image/webp',
    });
    expect(Object.keys(body).sort()).toEqual(
      ['height', 'id', 'mime', 'sizeBytes', 'url', 'width'].sort(),
    );
    expect(body.url).toMatch(/^\/media\/[0-9a-f]{64}\.webp$/);

    const key = (body.url as string).slice('/media/'.length);
    const stored = await readFile(path.join(uploadsDir, 'images', key));
    expect(stored.length).toBe(body.sizeBytes);
    const metadata = await sharp(stored).metadata();
    expect(metadata).toMatchObject({
      format: 'webp',
      width: 2000,
      height: 1000,
    });
    // No temp files are left behind.
    expect(await readdir(path.join(uploadsDir, 'images'))).toEqual([key]);

    const served = await request(apiUrl)
      .get(body.url as string)
      .expect(200)
      .expect('Content-Type', /image\/webp/)
      .expect('X-Content-Type-Options', 'nosniff')
      .expect('Cache-Control', /immutable/);
    expect(served.body).toEqual(stored);

    const row = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: body.id as string },
    });
    expect(row).toMatchObject({
      kind: 'IMAGE',
      storageKey: key,
      mime: 'image/webp',
      width: 2000,
      height: 1000,
      checksum: key.replace('.webp', ''),
    });
  });

  it('does not enlarge small images and accepts JPEG and WebP input', async () => {
    const jpeg = await sharp({
      create: { width: 120, height: 80, channels: 3, background: '#0e2366' },
    })
      .jpeg()
      .toBuffer();
    const fromJpeg = await upload(
      admin,
      jpeg,
      'photo.jpg',
      'image/jpeg',
    ).expect(201);
    expect(fromJpeg.body).toMatchObject({ width: 120, height: 80 });

    const webp = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#8fa9d6' },
    })
      .webp()
      .toBuffer();
    const fromWebp = await upload(admin, webp, 'x.webp', 'image/webp').expect(
      201,
    );
    expect(fromWebp.body).toMatchObject({ width: 64, height: 64 });
  });

  it('applies EXIF orientation and strips metadata', async () => {
    const tagged = await sharp({
      create: { width: 100, height: 50, channels: 3, background: '#2a55b8' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const response = await upload(
      admin,
      tagged,
      'rot.jpg',
      'image/jpeg',
    ).expect(201);
    const body = response.body as Json;
    expect(body).toMatchObject({ width: 50, height: 100 });
    const key = (body.url as string).slice('/media/'.length);
    const output = await sharp(
      await readFile(path.join(uploadsDir, 'images', key)),
    ).metadata();
    expect(output.exif).toBeUndefined();
    expect(output.orientation).toBeUndefined();
  });

  it('dedupes identical output and returns the existing asset', async () => {
    const image = await png(300, 200);
    const first = await uploadOk(image);
    const second = await uploadOk(image);
    expect(second.id).toBe(first.id);
    expect(second.url).toBe(first.url);
    expect(await prisma.mediaAsset.count()).toBe(1);

    const other = await uploadOk(await png(300, 200, '#b9cae6'));
    expect(other.id).not.toBe(first.id);
    expect(await prisma.mediaAsset.count()).toBe(2);

    const racing = await Promise.all(
      Array.from({ length: 4 }, async () => upload(admin, await png(80, 80))),
    );
    expect(racing.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(new Set(racing.map((r) => r.body.id as string)).size).toBe(1);
    expect(await prisma.mediaAsset.count()).toBe(3);
  });

  it('trusts magic bytes, not the file name or declared type', async () => {
    await upload(
      admin,
      Buffer.from('this is plain text, not a picture'),
      'fake.png',
      'image/png',
    ).expect(415);
    await upload(
      admin,
      Buffer.from('GIF89a......'),
      'x.gif',
      'image/gif',
    ).expect(415);
    await upload(admin, Buffer.alloc(0), 'empty.png', 'image/png').expect(415);
    // A real PNG with a misleading name and type is still accepted.
    await upload(admin, await png(10, 10), 'notes.txt', 'text/plain').expect(
      201,
    );
    expect(await prisma.mediaAsset.count()).toBe(1);
  });

  it('rejects oversized uploads with 413 and a missing file with 400', async () => {
    const huge = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(10 * 1024 * 1024),
    ]);
    await upload(admin, huge).expect(413);
    await call(admin, 'post', '/api/v1/admin/media/images')
      .field('note', 'no file here')
      .expect(400);
    expect(await prisma.mediaAsset.count()).toBe(0);
  });

  it('rejects over-wide images and undecodable bytes with 422', async () => {
    await upload(admin, await png(12_001, 1)).expect(422);
    await upload(admin, await png(1, 20_000)).expect(422);
    await upload(
      admin,
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('truncated garbage that is not a png stream'),
      ]),
    ).expect(422);
    expect(await prisma.mediaAsset.count()).toBe(0);
  });

  it('requires an admin: 401 anonymous, 403 student', async () => {
    const image = await png(10, 10);
    await upload(undefined, image).expect(401);
    await upload(student, image).expect(403);
    expect(await prisma.mediaAsset.count()).toBe(0);
  });

  it('attaches images to levels and lessons and exposes them publicly', async () => {
    const unknown = '99999999-9999-4999-8999-999999999999';
    const levelBody = {
      slug: 'with-cover',
      hanzi: '入门',
      title: { en: 'Cover level' },
      summary: { en: 'Summary' },
    };
    await call(admin, 'post', '/api/v1/admin/levels')
      .send({ ...levelBody, coverImageId: unknown })
      .expect(400);
    await call(admin, 'post', '/api/v1/admin/levels')
      .send({ ...levelBody, coverImageId: 'not-a-uuid' })
      .expect(400);

    const level = (
      await call(admin, 'post', '/api/v1/admin/levels')
        .send(levelBody)
        .expect(201)
    ).body as Json;
    expect(level).toMatchObject({ coverImageId: null, coverImage: null });
    const levelId = level.id as string;

    await call(admin, 'patch', `/api/v1/admin/levels/${levelId}`)
      .send({ coverImageId: unknown })
      .expect(400);

    const cover = await uploadOk(await png(800, 600));
    const attached = await call(
      admin,
      'patch',
      `/api/v1/admin/levels/${levelId}`,
    )
      .send({ coverImageId: cover.id })
      .expect(200);
    expect(attached.body).toMatchObject({
      coverImageId: cover.id,
      coverImage: { url: cover.url, width: 800, height: 600 },
    });

    const lesson = (
      await call(admin, 'post', `/api/v1/admin/levels/${levelId}/lessons`)
        .send({ title: { en: 'Lesson' }, thumbnailId: unknown })
        .expect(400)
        .then(() =>
          call(admin, 'post', `/api/v1/admin/levels/${levelId}/lessons`)
            .send({ title: { en: 'Lesson' } })
            .expect(201),
        )
    ).body as Json;
    const lessonId = lesson.id as string;
    await call(admin, 'patch', `/api/v1/admin/lessons/${lessonId}`)
      .send({ thumbnailId: unknown })
      .expect(400);
    const thumb = await uploadOk(await png(400, 400, '#8fa9d6'));
    const lessonAttached = await call(
      admin,
      'patch',
      `/api/v1/admin/lessons/${lessonId}`,
    )
      .send({ thumbnailId: thumb.id })
      .expect(200);
    expect(lessonAttached.body).toMatchObject({
      thumbnailId: thumb.id,
      thumbnail: { url: thumb.url, width: 400, height: 400 },
    });

    // Not public until published.
    await call(undefined, 'get', '/api/v1/catalog/levels/with-cover').expect(
      404,
    );
    await call(admin, 'post', `/api/v1/admin/levels/${levelId}/publish`).expect(
      200,
    );
    await call(
      admin,
      'post',
      `/api/v1/admin/lessons/${lessonId}/publish`,
    ).expect(200);

    const list = await call(undefined, 'get', '/api/v1/catalog/levels').expect(
      200,
    );
    expect(list.body.levels[0].coverImage).toEqual({
      url: cover.url,
      width: 800,
      height: 600,
    });
    const detail = await call(
      undefined,
      'get',
      '/api/v1/catalog/levels/with-cover',
    ).expect(200);
    expect(detail.body.coverImage).toEqual({
      url: cover.url,
      width: 800,
      height: 600,
    });
    expect(detail.body.lessons[0].thumbnail).toEqual({
      url: thumb.url,
      width: 400,
      height: 400,
    });

    // Detaching with null clears the reference without touching the asset.
    const cleared = await call(
      admin,
      'patch',
      `/api/v1/admin/levels/${levelId}`,
    )
      .send({ coverImageId: null })
      .expect(200);
    expect(cleared.body).toMatchObject({
      coverImageId: null,
      coverImage: null,
    });
    expect(await prisma.mediaAsset.count()).toBe(2);
  });
});
