import { execFile, fork, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

import { PrismaPg } from '@prisma/adapter-pg';
import request, { type Response } from 'supertest';
import { Role } from '@app/shared';

import { PrismaClient } from '../src/generated/prisma/client';

const execFileAsync = promisify(execFile);
const origin = 'http://localhost:3000';
const credentials = {
  email: 'catalog-admin@example.com',
  password: 'initial-password',
  name: 'Catalog Admin',
  phone: '+20 100-123-4567',
};

type Agent = ReturnType<typeof request.agent>;
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Json = Record<string, unknown>;

const levelBody = (slug: string, extra: Json = {}): Json => ({
  slug,
  hanzi: '入门',
  title: { en: `Title ${slug}`, ar: 'عنوان' },
  summary: { en: 'Summary' },
  ...extra,
});

describe('catalog API (e2e)', () => {
  let apiUrl: string;
  let child: ChildProcess;
  let childOutput = '';
  let prisma: PrismaClient;
  let admin: Agent;
  let student: Agent;
  let ipCounter = 0;

  // The global throttler allows 100 requests a minute per IP, so every call
  // pretends to come from a fresh forwarded address.
  function call(agent: Agent | undefined, method: Method, path: string) {
    ipCounter += 1;
    const base = agent ?? request(apiUrl);
    const target = agent ? agent[method](path) : base[method](path);
    return target
      .set('Origin', origin)
      .set(
        'X-Forwarded-For',
        `203.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`,
      );
  }

  async function signIn(email: string, role: Role): Promise<Agent> {
    const agent = request.agent(apiUrl);
    await call(agent, 'post', '/api/v1/auth/register')
      .send({ ...credentials, email })
      .expect(201);
    await prisma.user.update({ where: { email }, data: { role } });
    await call(
      agent,
      'post',
      role === Role.ADMIN ? '/api/v1/auth/admin/login' : '/api/v1/auth/login',
    )
      .send({ email, password: credentials.password })
      .expect(200);
    return agent;
  }

  async function createLevel(slug: string, extra: Json = {}): Promise<Json> {
    const response = await call(admin, 'post', '/api/v1/admin/levels')
      .send(levelBody(slug, extra))
      .expect(201);
    return response.body as Json;
  }

  async function createLesson(
    levelId: string,
    title = 'Lesson',
    extra: Json = {},
  ): Promise<Json> {
    const response = await call(
      admin,
      'post',
      `/api/v1/admin/levels/${levelId}/lessons`,
    )
      .send({ title: { en: title }, ...extra })
      .expect(201);
    return response.body as Json;
  }

  async function action(
    kind: 'levels' | 'lessons',
    id: string,
    verb: 'publish' | 'unpublish' | 'archive' | 'unarchive',
  ): Promise<Response> {
    return call(admin, 'post', `/api/v1/admin/${kind}/${id}/${verb}`).expect(
      200,
    );
  }

  const publicLevels = () => call(undefined, 'get', '/api/v1/catalog/levels');

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    child = fork('test/test-server.ts', {
      cwd: process.cwd(),
      execArgv: ['--import', 'tsx'],
      env: { ...process.env },
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
    await prisma.enrollment.deleteMany();
    await prisma.paymentTransaction.deleteMany();
    await prisma.order.deleteMany();
    await prisma.quizAttempt.deleteMany();
    await prisma.quiz.deleteMany();
    await prisma.lessonProgress.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.level.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
    admin = await signIn('catalog-admin@example.com', Role.ADMIN);
    student = await signIn('catalog-student@example.com', Role.STUDENT);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (child?.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    }
  });

  it('rejects anonymous callers with 401 and students with 403 on admin routes', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const routes: [Method, string][] = [
      ['get', '/api/v1/admin/levels'],
      ['post', '/api/v1/admin/levels'],
      ['get', `/api/v1/admin/levels/${id}`],
      ['patch', `/api/v1/admin/levels/${id}`],
      ['delete', `/api/v1/admin/levels/${id}`],
      ['post', `/api/v1/admin/levels/${id}/publish`],
      ['put', '/api/v1/admin/levels/order'],
      ['post', `/api/v1/admin/levels/${id}/lessons`],
      ['put', `/api/v1/admin/levels/${id}/lessons/order`],
      ['get', `/api/v1/admin/lessons/${id}`],
      ['patch', `/api/v1/admin/lessons/${id}`],
      ['delete', `/api/v1/admin/lessons/${id}`],
      ['post', `/api/v1/admin/lessons/${id}/archive`],
    ];
    for (const [method, path] of routes) {
      await call(undefined, method, path).send({}).expect(401);
      await call(student, method, path).send({}).expect(403);
    }
  });

  it('creates, reads, updates and validates levels and lessons', async () => {
    const level = await createLevel('level-1', {
      topics: [{ en: 'Tones' }],
      priceMinor: 150_000,
    });
    expect(level).toMatchObject({
      slug: 'level-1',
      sortOrder: 1,
      isPublished: false,
      firstPublishedAt: null,
      archivedAt: null,
      currency: 'EGP',
      priceMinor: 150_000,
      lessonCount: 0,
    });

    const levelId = level.id as string;
    const lesson = await createLesson(levelId, 'Tones', {
      hanzi: '声调',
      description: { en: 'About tones' },
      isFreePreview: true,
    });
    expect(lesson).toMatchObject({
      levelId,
      sortOrder: 1,
      hanzi: '声调',
      isFreePreview: true,
      isPublished: false,
    });

    const detail = await call(admin, 'get', `/api/v1/admin/levels/${levelId}`)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(detail.body.lessons).toHaveLength(1);
    expect(detail.body.lessonCount).toBe(1);

    const list = await call(admin, 'get', '/api/v1/admin/levels').expect(200);
    expect(list.body.levels).toHaveLength(1);
    expect(list.body.levels[0].lessonCount).toBe(1);

    const patched = await call(
      admin,
      'patch',
      `/api/v1/admin/levels/${levelId}`,
    )
      .send({ hanzi: '日常', priceMinor: null, topics: [] })
      .expect(200);
    expect(patched.body).toMatchObject({
      hanzi: '日常',
      priceMinor: null,
      topics: [],
      slug: 'level-1',
    });

    await call(admin, 'get', `/api/v1/admin/lessons/${lesson.id as string}`)
      .expect(200)
      .expect('Cache-Control', 'private, no-store')
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ id: lesson.id, levelId, hanzi: '声调' }),
      );
    const patchedLesson = await call(
      admin,
      'patch',
      `/api/v1/admin/lessons/${lesson.id as string}`,
    )
      .send({ description: null, hanzi: null, title: { en: 'Renamed' } })
      .expect(200);
    expect(patchedLesson.body).toMatchObject({
      description: null,
      hanzi: null,
      title: { en: 'Renamed' },
    });

    const bad: Json[] = [
      levelBody('Bad_Slug'),
      levelBody('x'),
      levelBody('level-9', { title: { en: '   ' } }),
      levelBody('level-9', { priceMinor: -1 }),
      levelBody('level-9', { priceMinor: 10.5 }),
      levelBody('level-9', { priceMinor: 10_000_001 }),
      levelBody('level-9', {
        topics: Array.from({ length: 13 }, () => ({ en: 'Topic' })),
      }),
      levelBody('level-9', { hanzi: '' }),
    ];
    for (const body of bad) {
      await call(admin, 'post', '/api/v1/admin/levels').send(body).expect(400);
    }
    await call(admin, 'post', `/api/v1/admin/levels/${levelId}/lessons`)
      .send({ title: { en: '' } })
      .expect(400);
    await call(admin, 'patch', `/api/v1/admin/levels/${levelId}`)
      .send({ slug: 'NOPE' })
      .expect(400);

    await call(admin, 'get', '/api/v1/admin/levels/not-a-uuid').expect(400);
    await call(admin, 'delete', '/api/v1/admin/lessons/not-a-uuid').expect(400);
    await call(admin, 'get', '/api/v1/admin/lessons/not-a-uuid').expect(400);
    const missing = '99999999-9999-4999-8999-999999999999';
    await call(admin, 'get', `/api/v1/admin/levels/${missing}`).expect(404);
    await call(admin, 'get', `/api/v1/admin/lessons/${missing}`).expect(404);
    await call(admin, 'patch', `/api/v1/admin/lessons/${missing}`)
      .send({})
      .expect(404);
    await call(admin, 'post', `/api/v1/admin/levels/${missing}/lessons`)
      .send({ title: { en: 'x' } })
      .expect(404);

    await call(admin, 'post', '/api/v1/admin/levels')
      .send(levelBody('level-1'))
      .expect(409);
    const other = await createLevel('level-2');
    await call(admin, 'patch', `/api/v1/admin/levels/${other.id as string}`)
      .send({ slug: 'level-1' })
      .expect(409);
  });

  it('controls public visibility with publish, unpublish, archive and unarchive', async () => {
    const first = await createLevel('first');
    const second = await createLevel('second');
    const third = await createLevel('third');
    expect((await publicLevels().expect(200)).body).toEqual({ levels: [] });

    await action('levels', first.id as string, 'publish');
    await action('levels', second.id as string, 'publish');
    await action('levels', third.id as string, 'publish');

    const l1 = await createLesson(second.id as string, 'One');
    const l2 = await createLesson(second.id as string, 'Two');
    const l3 = await createLesson(second.id as string, 'Three');
    await action('lessons', l1.id as string, 'publish');
    await action('lessons', l3.id as string, 'publish');
    // l2 stays unpublished inside a published level.

    let body = (await publicLevels().expect(200)).body;
    expect(
      body.levels.map((l: Json) => [l.slug, l.number, l.lessonCount]),
    ).toEqual([
      ['first', 1, 0],
      ['second', 2, 2],
      ['third', 3, 0],
    ]);
    let detail = (
      await call(undefined, 'get', '/api/v1/catalog/levels/second').expect(200)
    ).body;
    expect(detail.lessons.map((l: Json) => [l.number, l.title])).toEqual([
      [1, { en: 'One' }],
      [2, { en: 'Three' }],
    ]);

    // Archiving a lesson hides it; numbering closes the gap.
    await action('lessons', l1.id as string, 'archive');
    detail = (
      await call(undefined, 'get', '/api/v1/catalog/levels/second').expect(200)
    ).body;
    expect(detail.lessons.map((l: Json) => [l.number, l.id])).toEqual([
      [1, l3.id],
    ]);
    await action('lessons', l1.id as string, 'unarchive');
    await action('lessons', l2.id as string, 'publish');
    detail = (
      await call(undefined, 'get', '/api/v1/catalog/levels/second').expect(200)
    ).body;
    expect(detail.lessons).toHaveLength(3);

    // Hiding the first level renumbers the rest.
    await action('levels', first.id as string, 'archive');
    body = (await publicLevels().expect(200)).body;
    expect(body.levels.map((l: Json) => [l.slug, l.number])).toEqual([
      ['second', 1],
      ['third', 2],
    ]);
    await call(undefined, 'get', '/api/v1/catalog/levels/first').expect(404);
    await action('levels', first.id as string, 'unarchive');
    await call(undefined, 'get', '/api/v1/catalog/levels/first').expect(200);

    await action('levels', third.id as string, 'unpublish');
    await call(undefined, 'get', '/api/v1/catalog/levels/third').expect(404);
    await call(undefined, 'get', '/api/v1/catalog/levels/unknown').expect(404);
    body = (await publicLevels().expect(200)).body;
    expect(body.levels.map((l: Json) => l.slug)).toEqual(['first', 'second']);

    // Unpublishing keeps firstPublishedAt; archive is idempotent.
    const unpublished = await prisma.level.findUniqueOrThrow({
      where: { id: third.id as string },
    });
    expect(unpublished.isPublished).toBe(false);
    expect(unpublished.firstPublishedAt).not.toBeNull();
    const archivedOnce = await action('levels', third.id as string, 'archive');
    const archivedTwice = await action('levels', third.id as string, 'archive');
    expect(archivedTwice.body.archivedAt).toBe(archivedOnce.body.archivedAt);
  });

  it('keeps published slugs immutable and permanently deletes complete content trees', async () => {
    const level = await createLevel('draft-level');
    const levelId = level.id as string;
    await call(admin, 'patch', `/api/v1/admin/levels/${levelId}`)
      .send({ slug: 'renamed-level' })
      .expect(200)
      .expect(({ body }: Response) => expect(body.slug).toBe('renamed-level'));

    await action('levels', levelId, 'publish');
    await call(admin, 'patch', `/api/v1/admin/levels/${levelId}`)
      .send({ slug: 'again' })
      .expect(409);
    // Re-sending the unchanged slug alongside other edits is fine.
    await call(admin, 'patch', `/api/v1/admin/levels/${levelId}`)
      .send({ slug: 'renamed-level', hanzi: '新' })
      .expect(200);
    await action('levels', levelId, 'unpublish');
    await call(admin, 'patch', `/api/v1/admin/levels/${levelId}`)
      .send({ slug: 'again' })
      .expect(409);

    await call(admin, 'delete', `/api/v1/admin/levels/${levelId}`).expect(204);
    expect(await prisma.level.count({ where: { id: levelId } })).toBe(0);

    const studentUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'catalog-student@example.com' },
    });
    const seedLearningHistory = async (lessonId: string, suffix: string) => {
      const quiz = await prisma.quiz.create({
        data: {
          lessonId,
          title: { en: `Quiz ${suffix}` },
          passingScore: 70,
          sortOrder: 1,
        },
      });
      await prisma.quizAttempt.create({
        data: {
          userId: studentUser.id,
          quizId: quiz.id,
          score: 100,
          earnedPoints: 1,
          totalPoints: 1,
          passed: true,
          snapshot: {},
        },
      });
      await prisma.lessonProgress.create({
        data: {
          userId: studentUser.id,
          lessonId,
          completedAt: new Date(),
        },
      });
      return quiz.id;
    };

    const lessonLevel = await createLevel('lesson-cascade');
    const publishedLesson = await createLesson(
      lessonLevel.id as string,
      'Published lesson',
    );
    const lessonQuizId = await seedLearningHistory(
      publishedLesson.id as string,
      'lesson',
    );
    await action('lessons', publishedLesson.id as string, 'publish');
    await call(
      admin,
      'delete',
      `/api/v1/admin/lessons/${publishedLesson.id as string}`,
    ).expect(204);
    expect(
      await prisma.lesson.count({ where: { id: publishedLesson.id as string } }),
    ).toBe(0);
    expect(await prisma.quiz.count({ where: { id: lessonQuizId } })).toBe(0);
    expect(
      await prisma.quizAttempt.count({ where: { quizId: lessonQuizId } }),
    ).toBe(0);
    expect(
      await prisma.lessonProgress.count({
        where: { lessonId: publishedLesson.id as string },
      }),
    ).toBe(0);

    const fullLevel = await createLevel('level-cascade');
    const nestedLesson = await createLesson(
      fullLevel.id as string,
      'Nested lesson',
    );
    const nestedQuizId = await seedLearningHistory(
      nestedLesson.id as string,
      'level',
    );
    const order = await prisma.order.create({
      data: {
        userId: studentUser.id,
        levelId: fullLevel.id as string,
        amountMinor: 100,
        currency: 'EGP',
        status: 'PAID',
        specialReference: 'delete-cascade-order',
        expiresAt: new Date(Date.now() + 60_000),
        paidAt: new Date(),
      },
    });
    await prisma.paymentTransaction.create({
      data: {
        orderId: order.id,
        providerTransactionId: 'delete-cascade-transaction',
        integrationId: 'test',
        success: true,
        pending: false,
        isRefund: false,
        isVoided: false,
        amountMinor: 100,
        currency: 'EGP',
        payloadRedacted: {},
        occurredAt: new Date(),
      },
    });
    await prisma.enrollment.create({
      data: {
        userId: studentUser.id,
        levelId: fullLevel.id as string,
        source: 'PURCHASE',
        orderId: order.id,
      },
    });
    await action('lessons', nestedLesson.id as string, 'publish');
    await action('levels', fullLevel.id as string, 'publish');
    await call(
      admin,
      'delete',
      `/api/v1/admin/levels/${fullLevel.id as string}`,
    ).expect(204);
    expect(
      await prisma.level.count({ where: { id: fullLevel.id as string } }),
    ).toBe(0);
    expect(await prisma.quiz.count({ where: { id: nestedQuizId } })).toBe(0);
    expect(
      await prisma.lessonProgress.count({
        where: { lessonId: nestedLesson.id as string },
      }),
    ).toBe(0);
    expect(await prisma.order.count({ where: { id: order.id } })).toBe(0);
    expect(
      await prisma.paymentTransaction.count({ where: { orderId: order.id } }),
    ).toBe(0);
    expect(
      await prisma.enrollment.count({
        where: { levelId: fullLevel.id as string },
      }),
    ).toBe(0);
  });

  it('reorders levels and lessons atomically and appends after a reorder', async () => {
    const a = (await createLevel('level-a')).id as string;
    const b = (await createLevel('level-b')).id as string;
    const c = (await createLevel('level-c')).id as string;
    await action('levels', b, 'archive'); // archived rows are part of the scope

    const reordered = await call(admin, 'put', '/api/v1/admin/levels/order')
      .send({ ids: [c, a, b] })
      .expect(200);
    expect(reordered.body.levels.map((l: Json) => [l.id, l.sortOrder])).toEqual(
      [
        [c, 1],
        [a, 2],
        [b, 3],
      ],
    );

    const invalid: string[][] = [
      [c, a],
      [c, a, a],
      [c, a, b, b],
      [c, a, '99999999-9999-4999-8999-999999999999'],
      [],
    ];
    for (const ids of invalid) {
      await call(admin, 'put', '/api/v1/admin/levels/order')
        .send({ ids })
        .expect(400);
    }
    await call(admin, 'put', '/api/v1/admin/levels/order')
      .send({ ids: ['nope'] })
      .expect(400);
    const persisted = await prisma.level.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    expect(persisted.map((row) => row.id)).toEqual([c, a, b]);

    const d = await createLevel('level-d');
    expect(d.sortOrder).toBe(4);

    const lessonIds: string[] = [];
    for (const title of ['one', 'two', 'three']) {
      lessonIds.push((await createLesson(a, title)).id as string);
    }
    const foreign = (await createLesson(c, 'foreign')).id as string;
    const [one, two, three] = lessonIds as [string, string, string];
    const lessonOrder = await call(
      admin,
      'put',
      `/api/v1/admin/levels/${a}/lessons/order`,
    )
      .send({ ids: [three, one, two] })
      .expect(200);
    expect(
      lessonOrder.body.lessons.map((l: Json) => [l.id, l.sortOrder]),
    ).toEqual([
      [three, 1],
      [one, 2],
      [two, 3],
    ]);
    for (const ids of [
      [three, one],
      [three, one, two, foreign],
      [three, one, foreign],
      [three, three, one],
    ]) {
      await call(admin, 'put', `/api/v1/admin/levels/${a}/lessons/order`)
        .send({ ids })
        .expect(400);
    }
    await call(
      admin,
      'put',
      '/api/v1/admin/levels/99999999-9999-4999-8999-999999999999/lessons/order',
    )
      .send({ ids: [] })
      .expect(404);
    const next = await createLesson(a, 'four');
    expect(next.sortOrder).toBe(4);
    const stored = await prisma.lesson.findMany({
      where: { levelId: a },
      orderBy: { sortOrder: 'asc' },
    });
    expect(stored.map((row) => row.id)).toEqual([three, one, two, next.id]);
  });

  it('gives concurrent lesson and level creates distinct sortOrders', async () => {
    const level = (await createLevel('busy')).id as string;
    const lessons = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        call(admin, 'post', `/api/v1/admin/levels/${level}/lessons`).send({
          title: { en: `Concurrent ${index}` },
        }),
      ),
    );
    expect(lessons.map((response) => response.status)).toEqual(
      Array.from({ length: 6 }, () => 201),
    );
    const orders = lessons.map((r) => r.body.sortOrder as number).sort();
    expect(orders).toEqual([1, 2, 3, 4, 5, 6]);

    const levels = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        call(admin, 'post', '/api/v1/admin/levels').send(
          levelBody(`parallel-${index}`),
        ),
      ),
    );
    expect(levels.map((response) => response.status)).toEqual([
      201, 201, 201, 201,
    ]);
    expect(
      levels.map((r) => r.body.sortOrder as number).sort((x, y) => x - y),
    ).toEqual([2, 3, 4, 5]);
  });

  it('serves public responses with a cache header and only public fields', async () => {
    const level = await createLevel('public-level', {
      topics: [{ en: 'Tones', ar: 'نغمات' }],
      priceMinor: 99_900,
    });
    const levelId = level.id as string;
    await action('levels', levelId, 'publish');
    const lesson = await createLesson(levelId, 'Public lesson', {
      hanzi: '你好',
      isFreePreview: true,
    });
    await action('lessons', lesson.id as string, 'publish');
    const hidden = await createLesson(levelId, 'Hidden');
    await action('lessons', hidden.id as string, 'publish');
    await action('lessons', hidden.id as string, 'archive');

    const list = await publicLevels()
      .expect(200)
      .expect('Cache-Control', 'public, max-age=60');
    expect(Object.keys(list.body)).toEqual(['levels']);
    expect(Object.keys(list.body.levels[0]).sort()).toEqual(
      [
        'coverImage',
        'currency',
        'hanzi',
        'id',
        'lessonCount',
        'number',
        'priceMinor',
        'slug',
        'summary',
        'title',
        'topics',
      ].sort(),
    );
    expect(list.body.levels[0]).toMatchObject({
      number: 1,
      lessonCount: 1,
      priceMinor: 99_900,
      currency: 'EGP',
    });

    const detail = await call(
      undefined,
      'get',
      '/api/v1/catalog/levels/public-level',
    )
      .expect(200)
      .expect('Cache-Control', 'public, max-age=60');
    expect(Object.keys(detail.body).sort()).toEqual(
      [
        'coverImage',
        'currency',
        'hanzi',
        'id',
        'lessonCount',
        'lessons',
        'number',
        'priceMinor',
        'slug',
        'summary',
        'title',
        'topics',
      ].sort(),
    );
    expect(detail.body.lessons).toHaveLength(1);
    expect(Object.keys(detail.body.lessons[0]).sort()).toEqual(
      [
        'description',
        'hanzi',
        'id',
        'isFreePreview',
        'number',
        'thumbnail',
        'title',
      ].sort(),
    );
    expect(detail.body.lessons[0]).toMatchObject({
      number: 1,
      description: null,
      isFreePreview: true,
      thumbnail: null,
    });
    expect(detail.body.coverImage).toBeNull();
  });

  it('seeds the sample catalog idempotently and refuses production', async () => {
    const run = (env: Record<string, string> = {}) =>
      execFileAsync(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], {
        cwd: process.cwd(),
        env: { ...process.env, ...env },
      });
    await run();
    const counts = async () => ({
      levels: await prisma.level.count(),
      lessons: await prisma.lesson.count(),
    });
    const first = await counts();
    expect(first).toEqual({ levels: 4, lessons: 5 });
    await run();
    expect(await counts()).toEqual(first);

    const seeded = await publicLevels().expect(200);
    expect(seeded.body.levels.map((l: Json) => l.slug)).toEqual([
      'level-1',
      'level-2',
      'level-3',
      'level-4',
    ]);
    expect(seeded.body.levels[0].priceMinor).toBeNull();

    await expect(run({ NODE_ENV: 'production' })).rejects.toThrow();
  });
});
