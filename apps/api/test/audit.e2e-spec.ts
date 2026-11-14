import { fork, type ChildProcess } from 'node:child_process';
import { rm } from 'node:fs/promises';

import { PrismaPg } from '@prisma/adapter-pg';
import sharp from 'sharp';
import request from 'supertest';
import { Role } from '@app/shared';

import { PrismaClient } from '../src/generated/prisma/client';
import {
  makeLessonPublishable,
  makeLevelPublishable,
} from './publishable-content';

const origin = 'http://localhost:3000';
const password = 'initial-password';

type Agent = ReturnType<typeof request.agent>;
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Json = Record<string, unknown>;

const MP4_HEADER = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypisom'),
  Buffer.alloc(32),
]);

describe('audit log, admin overview and student status (e2e)', () => {
  let apiUrl: string;
  let child: ChildProcess;
  let childOutput = '';
  let prisma: PrismaClient;
  let admin: Agent;
  let adminId: string;
  let ipCounter = 0;
  let phoneCounter = 0;

  function call(agent: Agent | undefined, method: Method, path: string) {
    ipCounter += 1;
    const target = agent ? agent[method](path) : request(apiUrl)[method](path);
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
    name = 'Audit User',
  ): Promise<{ agent: Agent; id: string }> {
    const agent = request.agent(apiUrl);
    phoneCounter += 1;
    await call(agent, 'post', '/api/v1/auth/register')
      .send({
        email,
        password,
        name,
        phone: `+2010${String(20_000_000 + phoneCounter)}`,
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

  const post = (path: string, body: Json = {}) =>
    call(admin, 'post', path).send(body);

  async function createLevel(slug: string, extra: Json = {}): Promise<string> {
    const response = await post('/api/v1/admin/levels', {
      slug,
      hanzi: '入门',
      title: { en: `Title ${slug}`, ar: `عنوان ${slug}` },
      summary: { en: 'Summary' },
      ...extra,
    }).expect(201);
    return (response.body as { id: string }).id;
  }

  async function createLesson(
    levelId: string,
    title = 'Lesson',
    extra: Json = {},
  ): Promise<string> {
    const response = await post(`/api/v1/admin/levels/${levelId}/lessons`, {
      title: { en: title },
      ...extra,
    }).expect(201);
    return (response.body as { id: string }).id;
  }

  const option = (text: string, isCorrect = false) => ({
    text: { en: text },
    isCorrect,
  });

  const questionBody = (): Json => ({
    type: 'SINGLE',
    prompt: { en: 'Pick one' },
    options: [option('A', true), option('B')],
  });

  const rows = (where: Json = {}) =>
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'asc' } });

  /** Runs `action`, and returns the audit rows it added (oldest first). */
  async function added(action: () => Promise<unknown>) {
    const before = await prisma.auditLog.count();
    await action();
    const all = await rows();
    return all.slice(before);
  }

  async function expectOne(
    action: () => Promise<unknown>,
    expected: { action: string; entity: string; entityId?: string },
  ) {
    const created = await added(action);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      actorId: adminId,
      action: expected.action,
      entity: expected.entity,
      ...(expected.entityId ? { entityId: expected.entityId } : {}),
    });
    return created[0]!;
  }

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

  async function clean(): Promise<void> {
    await prisma.auditLog.deleteMany();
    await prisma.paymentTransaction.deleteMany();
    await prisma.order.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.quizAttempt.deleteMany();
    await prisma.lessonProgress.deleteMany();
    await prisma.quiz.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.level.deleteMany();
    await prisma.mediaAsset.deleteMany();
    await prisma.webhookEvent.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  }

  beforeEach(async () => {
    await clean();
    phoneCounter = 0;
    const signedIn = await signIn(
      'audit-admin@example.com',
      Role.ADMIN,
      'Audit Admin',
    );
    admin = signedIn.agent;
    adminId = signedIn.id;
    // Signing in is not an admin mutation: the log starts empty.
    expect(await prisma.auditLog.count()).toBe(0);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS audit_test_fail ON "AuditLog"',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS audit_test_fail()');
    await clean();
    await prisma?.$disconnect();
    if (child?.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    }
    if (process.env.UPLOADS_DIR) {
      await rm(process.env.UPLOADS_DIR, { recursive: true, force: true });
    }
  });

  it('rejects anonymous callers with 401 and students with 403', async () => {
    const { agent: student } = await signIn(
      'audit-student@example.com',
      Role.STUDENT,
    );
    const id = '11111111-1111-4111-8111-111111111111';
    const routes: [Method, string][] = [
      ['get', '/api/v1/admin/audit'],
      ['get', '/api/v1/admin/overview'],
      ['post', `/api/v1/admin/students/${id}/deactivate`],
      ['post', `/api/v1/admin/students/${id}/reactivate`],
    ];
    for (const [method, path] of routes) {
      await call(undefined, method, path).send({}).expect(401);
      await call(student, method, path).send({}).expect(403);
    }
  });

  it('offers no way to edit or remove an audit row', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      await call(admin, method, '/api/v1/admin/audit').send({}).expect(404);
      await call(admin, method, `/api/v1/admin/audit/${id}`)
        .send({})
        .expect(404);
    }
  });

  it('records each level mutation as exactly one row', async () => {
    const created = await added(() => createLevel('audit-level'));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      actorId: adminId,
      action: 'level.create',
      entity: 'Level',
    });
    const levelId = created[0]!.entityId;
    expect(created[0]!.data).toEqual({
      slug: 'audit-level',
      priceMinor: null,
    });

    const update = await expectOne(
      () =>
        call(admin, 'patch', `/api/v1/admin/levels/${levelId}`)
          .send({ title: { en: 'Renamed' }, priceMinor: 25000 })
          .expect(200),
      { action: 'level.update', entity: 'Level', entityId: levelId },
    );
    expect(update.data).toEqual({
      changed: ['title', 'priceMinor'],
      values: {
        title: {
          from: { en: 'Title audit-level', ar: 'عنوان audit-level' },
          to: { en: 'Renamed' },
        },
        priceMinor: { from: null, to: 25000 },
      },
    });

    // Saving the same values changes nothing, so records nothing.
    expect(
      await added(() =>
        call(admin, 'patch', `/api/v1/admin/levels/${levelId}`)
          .send({ priceMinor: 25000 })
          .expect(200),
      ),
    ).toHaveLength(0);

    await makeLevelPublishable(prisma, levelId);
    for (const verb of ['publish', 'unpublish', 'archive', 'unarchive']) {
      await expectOne(
        () => post(`/api/v1/admin/levels/${levelId}/${verb}`).expect(200),
        { action: `level.${verb}`, entity: 'Level', entityId: levelId },
      );
    }
    // Repeating a transition that already holds records nothing.
    await post(`/api/v1/admin/levels/${levelId}/publish`).expect(200);
    expect(
      await added(() =>
        post(`/api/v1/admin/levels/${levelId}/publish`).expect(200),
      ),
    ).toHaveLength(0);

    const second = await createLevel('audit-level-2');
    const reorder = await expectOne(
      () =>
        call(admin, 'put', '/api/v1/admin/levels/order')
          .send({ ids: [second, levelId] })
          .expect(200),
      { action: 'level.reorder', entity: 'Level', entityId: 'all' },
    );
    expect(reorder.data).toEqual({ order: [second, levelId] });

    await expectOne(
      () => call(admin, 'delete', `/api/v1/admin/levels/${second}`).expect(204),
      { action: 'level.delete', entity: 'Level', entityId: second },
    );
  });

  it('records each lesson mutation as exactly one row', async () => {
    const levelId = await createLevel('audit-lessons');
    const lessonId = await (async () => {
      const [row] = await added(() => createLesson(levelId, 'First'));
      expect(row).toMatchObject({
        action: 'lesson.create',
        entity: 'Lesson',
        actorId: adminId,
      });
      expect(row!.data).toEqual({ levelId, isFreePreview: false });
      return row!.entityId;
    })();

    await expectOne(
      () =>
        call(admin, 'patch', `/api/v1/admin/lessons/${lessonId}`)
          .send({ title: { en: 'First, renamed' }, hanzi: '你好' })
          .expect(200),
      { action: 'lesson.update', entity: 'Lesson', entityId: lessonId },
    );
    const toggle = await expectOne(
      () =>
        call(admin, 'patch', `/api/v1/admin/lessons/${lessonId}`)
          .send({ isFreePreview: true })
          .expect(200),
      { action: 'lesson.free_preview', entity: 'Lesson', entityId: lessonId },
    );
    expect(toggle.data).toEqual({
      levelId,
      changed: ['isFreePreview'],
      values: { isFreePreview: { from: false, to: true } },
    });

    await makeLessonPublishable(prisma, lessonId);
    for (const verb of ['publish', 'unpublish', 'archive', 'unarchive']) {
      await expectOne(
        () => post(`/api/v1/admin/lessons/${lessonId}/${verb}`).expect(200),
        { action: `lesson.${verb}`, entity: 'Lesson', entityId: lessonId },
      );
    }

    const other = await createLesson(levelId, 'Second');
    await expectOne(
      () =>
        call(admin, 'put', `/api/v1/admin/levels/${levelId}/lessons/order`)
          .send({ ids: [other, lessonId] })
          .expect(200),
      { action: 'lesson.reorder', entity: 'Level', entityId: levelId },
    );
    await expectOne(
      () => call(admin, 'delete', `/api/v1/admin/lessons/${other}`).expect(204),
      { action: 'lesson.delete', entity: 'Lesson', entityId: other },
    );
  });

  it('records image uploads and the images attached through updates', async () => {
    const png = await sharp({
      create: {
        width: 40,
        height: 30,
        channels: 3,
        background: { r: 10, g: 40, b: 120 },
      },
    })
      .png()
      .toBuffer();
    let imageId = '';
    const upload = await expectOne(
      async () => {
        const response = await call(admin, 'post', '/api/v1/admin/media/images')
          .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
          .expect(201);
        imageId = (response.body as { id: string }).id;
      },
      { action: 'image.upload', entity: 'Image' },
    );
    expect(upload.entityId).toBe(imageId);
    expect(upload.data).toMatchObject({ width: 40, height: 30 });

    const levelId = await createLevel('audit-image');
    const attach = await expectOne(
      () =>
        call(admin, 'patch', `/api/v1/admin/levels/${levelId}`)
          .send({ coverImageId: imageId })
          .expect(200),
      { action: 'level.update', entity: 'Level', entityId: levelId },
    );
    expect(attach.data).toMatchObject({
      changed: ['coverImageId'],
      values: { coverImageId: { from: null, to: imageId } },
    });
    const detach = await expectOne(
      () =>
        call(admin, 'patch', `/api/v1/admin/levels/${levelId}`)
          .send({ coverImageId: null })
          .expect(200),
      { action: 'level.update', entity: 'Level', entityId: levelId },
    );
    expect(detach.data).toMatchObject({
      values: { coverImageId: { from: imageId, to: null } },
    });

    // A rejected upload records nothing.
    expect(
      await added(() =>
        call(admin, 'post', '/api/v1/admin/media/images')
          .attach('file', Buffer.from('not an image'), { filename: 'x.png' })
          .expect(415),
      ),
    ).toHaveLength(0);
  });

  it('records video uploads and removals against the lesson', async () => {
    const levelId = await createLevel('audit-video');
    const lessonId = await createLesson(levelId);
    const upload = await expectOne(
      () =>
        call(admin, 'post', `/api/v1/admin/lessons/${lessonId}/videos/local`)
          .attach('file', MP4_HEADER, {
            filename: 'lesson.mp4',
            contentType: 'video/mp4',
          })
          .expect(201),
      { action: 'video.upload_local', entity: 'Lesson', entityId: lessonId },
    );
    expect(upload.data).toMatchObject({
      sizeBytes: MP4_HEADER.length,
      replaced: false,
    });
    await expectOne(
      () =>
        call(admin, 'delete', `/api/v1/admin/lessons/${lessonId}/video`).expect(
          204,
        ),
      { action: 'video.remove', entity: 'Lesson', entityId: lessonId },
    );
    // Nothing left to remove: nothing to record.
    expect(
      await added(() =>
        call(admin, 'delete', `/api/v1/admin/lessons/${lessonId}/video`).expect(
          204,
        ),
      ),
    ).toHaveLength(0);
    // Bunny is not configured in tests, so the ticket request is a 409.
    expect(
      await added(() =>
        post(`/api/v1/admin/lessons/${lessonId}/videos`, {
          originalName: 'lesson.mp4',
        }).expect(409),
      ),
    ).toHaveLength(0);
  });

  it('records each quiz and question mutation as exactly one row', async () => {
    const levelId = await createLevel('audit-quiz');
    const lessonId = await createLesson(levelId);

    const [created] = await added(() =>
      post(`/api/v1/admin/lessons/${lessonId}/quizzes`, {
        title: { en: 'Check' },
        passingScore: 60,
      }).expect(201),
    );
    expect(created).toMatchObject({
      action: 'quiz.create',
      entity: 'Quiz',
      actorId: adminId,
    });
    const quizId = created!.entityId;
    expect(created!.data).toEqual({ lessonId, passingScore: 60 });

    const update = await expectOne(
      () =>
        call(admin, 'patch', `/api/v1/admin/quizzes/${quizId}`)
          .send({ passingScore: 80 })
          .expect(200),
      { action: 'quiz.update', entity: 'Quiz', entityId: quizId },
    );
    expect(update.data).toEqual({
      changed: ['passingScore'],
      values: { passingScore: { from: 60, to: 80 } },
    });

    const [question] = await added(() =>
      post(`/api/v1/admin/quizzes/${quizId}/questions`, questionBody()).expect(
        201,
      ),
    );
    expect(question).toMatchObject({
      action: 'question.create',
      entity: 'Quiz',
      entityId: quizId,
    });
    const questionId = (question!.data as { questionId: string }).questionId;
    const second = (
      await post(`/api/v1/admin/quizzes/${quizId}/questions`, questionBody())
        .expect(201)
        .then((r) => r.body as { id: string })
    ).id;

    const replaced = await expectOne(
      () =>
        call(admin, 'put', `/api/v1/admin/questions/${questionId}`)
          .send({ ...questionBody(), points: 3 })
          .expect(200),
      { action: 'question.update', entity: 'Quiz', entityId: quizId },
    );
    expect(replaced.data).toMatchObject({
      questionId,
      changed: ['points'],
    });
    await expectOne(
      () =>
        call(admin, 'put', `/api/v1/admin/quizzes/${quizId}/questions/order`)
          .send({ ids: [second, questionId] })
          .expect(200),
      { action: 'question.reorder', entity: 'Quiz', entityId: quizId },
    );
    await expectOne(
      () =>
        call(admin, 'delete', `/api/v1/admin/questions/${second}`).expect(204),
      { action: 'question.delete', entity: 'Quiz', entityId: quizId },
    );

    await expectOne(() => post(`/api/v1/admin/quizzes/${quizId}/archive`), {
      action: 'quiz.archive',
      entity: 'Quiz',
      entityId: quizId,
    });
    await expectOne(() => post(`/api/v1/admin/quizzes/${quizId}/restore`), {
      action: 'quiz.restore',
      entity: 'Quiz',
      entityId: quizId,
    });

    const other = (
      await post(`/api/v1/admin/lessons/${lessonId}/quizzes`, {
        title: { en: 'Other' },
      })
        .expect(201)
        .then((r) => r.body as { id: string })
    ).id;
    await expectOne(
      () =>
        call(admin, 'put', `/api/v1/admin/lessons/${lessonId}/quizzes/order`)
          .send({ ids: [other, quizId] })
          .expect(200),
      { action: 'quiz.reorder', entity: 'Lesson', entityId: lessonId },
    );
    await expectOne(
      () => call(admin, 'delete', `/api/v1/admin/quizzes/${other}`).expect(204),
      { action: 'quiz.delete', entity: 'Quiz', entityId: other },
    );
  });

  it('records enrollment grants, revocations and reactivations against the student', async () => {
    const levelId = await createLevel('audit-enroll');
    await makeLevelPublishable(prisma, levelId);
    await post(`/api/v1/admin/levels/${levelId}/publish`).expect(200);
    const { id: studentId } = await signIn(
      'audit-grantee@example.com',
      Role.STUDENT,
      'Grantee',
    );
    const base = `/api/v1/admin/students/${studentId}`;

    const grant = await expectOne(
      () => post(`${base}/enrollments`, { levelId }).expect(201),
      { action: 'enrollment.grant', entity: 'Student', entityId: studentId },
    );
    expect(grant.data).toMatchObject({ levelId });
    // Granting what is already active records nothing.
    expect(
      await added(() => post(`${base}/enrollments`, { levelId }).expect(201)),
    ).toHaveLength(0);

    const revoke = await expectOne(
      () =>
        call(admin, 'delete', `${base}/enrollments/${levelId}`)
          .send({ reason: 'Refunded by hand' })
          .expect(204),
      { action: 'enrollment.revoke', entity: 'Student', entityId: studentId },
    );
    expect(revoke.data).toEqual({ levelId, reason: 'Refunded by hand' });
    expect(
      await added(() =>
        call(admin, 'delete', `${base}/enrollments/${levelId}`)
          .send({})
          .expect(204),
      ),
    ).toHaveLength(0);

    await expectOne(() => post(`${base}/enrollments`, { levelId }), {
      action: 'enrollment.reactivate',
      entity: 'Student',
      entityId: studentId,
    });

    // An unpublished level cannot be granted: a 409 records nothing.
    const draft = await createLevel('audit-draft');
    expect(
      await added(() =>
        post(`${base}/enrollments`, { levelId: draft }).expect(409),
      ),
    ).toHaveLength(0);
  });

  it('records no row when the mutation fails', async () => {
    const levelId = await createLevel('audit-fail');
    const lessonId = await createLesson(levelId);
    const before = await prisma.auditLog.count();

    // Validation errors (400).
    await post('/api/v1/admin/levels', { slug: 'x' }).expect(400);
    await call(admin, 'patch', `/api/v1/admin/levels/${levelId}`)
      .send({ priceMinor: -5 })
      .expect(400);
    await post(`/api/v1/admin/lessons/${lessonId}/quizzes`, {}).expect(400);
    // Conflicts (409).
    await post('/api/v1/admin/levels', {
      slug: 'audit-fail',
      hanzi: '入门',
      title: { en: 'Again' },
      summary: { en: 'S' },
    }).expect(409);
    // Domain rule (422), unknown ids (404) and an incomplete order (400).
    const quizId = (
      await post(`/api/v1/admin/lessons/${lessonId}/quizzes`, {
        title: { en: 'Q' },
      })
        .expect(201)
        .then((r) => r.body as { id: string })
    ).id;
    const afterQuiz = await prisma.auditLog.count();
    expect(afterQuiz).toBe(before + 1);
    await post(`/api/v1/admin/quizzes/${quizId}/questions`, {
      type: 'SINGLE',
      prompt: { en: 'No correct option' },
      options: [option('A'), option('B')],
    }).expect(422);
    const missing = '22222222-2222-4222-8222-222222222222';
    await call(admin, 'patch', `/api/v1/admin/lessons/${missing}`)
      .send({ hanzi: '好' })
      .expect(404);
    await post(`/api/v1/admin/lessons/${missing}/publish`).expect(404);
    await call(admin, 'put', '/api/v1/admin/levels/order')
      .send({ ids: [levelId, levelId] })
      .expect(400);

    expect(await prisma.auditLog.count()).toBe(afterQuiz);
  });

  it('commits the change and its audit row together', async () => {
    // A trigger makes the audit insert fail for one slug, after the level row
    // itself was written inside the same transaction.
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION audit_test_fail() RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'level.create' AND NEW.data->>'slug' = 'audit-boom' THEN
          RAISE EXCEPTION 'audit insert refused';
        END IF;
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER audit_test_fail BEFORE INSERT ON "AuditLog"
      FOR EACH ROW EXECUTE FUNCTION audit_test_fail()`);
    try {
      await post('/api/v1/admin/levels', {
        slug: 'audit-boom',
        hanzi: '入门',
        title: { en: 'Boom' },
        summary: { en: 'S' },
      }).expect(500);
      expect(await prisma.level.count({ where: { slug: 'audit-boom' } })).toBe(
        0,
      );
      expect(await prisma.auditLog.count()).toBe(0);
      // Other slugs are unaffected.
      await createLevel('audit-fine');
      expect(await prisma.auditLog.count()).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS audit_test_fail ON "AuditLog"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS audit_test_fail()',
      );
    }
  });

  it('lists entries newest first with actor, labels, filters and pages', async () => {
    const levelId = await createLevel('audit-list', {
      title: { en: 'Listed', ar: 'مُدرج' },
    });
    const lessonId = await createLesson(levelId, 'Listed lesson');
    await makeLevelPublishable(prisma, levelId);
    await post(`/api/v1/admin/levels/${levelId}/publish`).expect(200);
    const { id: studentId } = await signIn(
      'audit-listed@example.com',
      Role.STUDENT,
      'Listed Student',
    );
    await post(`/api/v1/admin/students/${studentId}/deactivate`).expect(200);
    const second = await signIn(
      'audit-second-admin@example.com',
      Role.ADMIN,
      'Second Admin',
    );
    await call(second.agent, 'post', `/api/v1/admin/levels/${levelId}/archive`)
      .send({})
      .expect(200);
    await call(
      second.agent,
      'post',
      `/api/v1/admin/levels/${levelId}/unarchive`,
    )
      .send({})
      .expect(200);

    const get = (query = '') =>
      call(admin, 'get', `/api/v1/admin/audit${query}`).expect(200);

    const all = (await get()).body as {
      entries: Array<{
        action: string;
        createdAt: string;
        entityLabel: Json | null;
        actor: Json;
        data: Json;
      }>;
      total: number;
      page: number;
      pageSize: number;
    };
    expect(all.total).toBe(6);
    expect(all.page).toBe(1);
    expect(all.pageSize).toBe(25);
    expect(all.entries.map((entry) => entry.action)).toEqual([
      'level.unarchive',
      'level.archive',
      'student.deactivate',
      'level.publish',
      'lesson.create',
      'level.create',
    ]);
    const times = all.entries.map((entry) => entry.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    const newest = all.entries[0]!;
    expect(newest.action).toBe('level.unarchive');
    expect(newest.actor).toEqual({
      id: second.id,
      name: 'Second Admin',
      email: 'audit-second-admin@example.com',
    });
    expect(newest.entityLabel).toEqual({ en: 'Listed', ar: 'مُدرج' });
    const deactivation = all.entries.find(
      (entry) => entry.action === 'student.deactivate',
    )!;
    expect(deactivation.entityLabel).toEqual({ en: 'Listed Student' });
    expect(deactivation.actor).toMatchObject({ name: 'Audit Admin' });

    const byEntity = (await get(`?entity=Level&entityId=${levelId}`))
      .body as typeof all;
    expect(byEntity.total).toBe(4);
    expect(byEntity.entries.every((e) => e.action.startsWith('level.'))).toBe(
      true,
    );
    expect(
      ((await get(`?entity=Lesson&entityId=${lessonId}`)).body as typeof all)
        .total,
    ).toBe(1);
    expect(
      ((await get('?action=level.publish')).body as typeof all).total,
    ).toBe(1);
    expect(
      ((await get(`?actorId=${second.id}`)).body as typeof all).total,
    ).toBe(2);
    expect(
      ((await get('?actor=second%20admin')).body as typeof all).total,
    ).toBe(2);
    expect(
      ((await get('?actor=nobody-like-this')).body as typeof all).total,
    ).toBe(0);

    // Dates are Cairo calendar days: today covers everything above, and
    // yesterday and earlier covers nothing.
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
    }).format(new Date());
    expect(
      ((await get(`?from=${today}&to=${today}`)).body as typeof all).total,
    ).toBe(6);
    expect(((await get('?to=2020-01-01')).body as typeof all).total).toBe(0);
    expect(((await get('?from=2999-01-01')).body as typeof all).total).toBe(0);

    const firstPage = (await get('?pageSize=4')).body as typeof all;
    const secondPage = (await get('?pageSize=4&page=2')).body as typeof all;
    const thirdPage = (await get('?pageSize=4&page=3')).body as typeof all;
    expect(firstPage.entries.map((entry) => entry.action)).toEqual(
      all.entries.slice(0, 4).map((entry) => entry.action),
    );
    expect(secondPage.entries.map((entry) => entry.action)).toEqual(
      all.entries.slice(4).map((entry) => entry.action),
    );
    expect(thirdPage.entries).toHaveLength(0);
    expect([firstPage.total, secondPage.total, thirdPage.total]).toEqual([
      6, 6, 6,
    ]);
    expect(secondPage.page).toBe(2);

    // Bad filters are 400s.
    await call(admin, 'get', '/api/v1/admin/audit?actorId=nope').expect(400);
    await call(admin, 'get', '/api/v1/admin/audit?from=yesterday').expect(400);
    await call(admin, 'get', '/api/v1/admin/audit?pageSize=500').expect(400);
  });

  it('labels deleted entities with nothing, never with a stale name', async () => {
    const levelId = await createLevel('audit-gone');
    await call(admin, 'delete', `/api/v1/admin/levels/${levelId}`).expect(204);
    const { entries } = (
      await call(
        admin,
        'get',
        `/api/v1/admin/audit?entity=Level&entityId=${levelId}`,
      ).expect(200)
    ).body as { entries: Array<{ action: string; entityLabel: unknown }> };
    expect(entries.map((entry) => entry.action)).toEqual([
      'level.delete',
      'level.create',
    ]);
    expect(entries.every((entry) => entry.entityLabel === null)).toBe(true);
  });

  it('keeps secrets and personal values out of every row', async () => {
    const levelId = await createLevel('audit-secrets');
    await makeLevelPublishable(prisma, levelId);
    await post(`/api/v1/admin/levels/${levelId}/publish`).expect(200);
    const { id: studentId } = await signIn(
      'audit-private@example.com',
      Role.STUDENT,
      'Private Student',
    );
    await post(`/api/v1/admin/students/${studentId}/enrollments`, {
      levelId,
    }).expect(201);
    await post(`/api/v1/admin/students/${studentId}/deactivate`).expect(200);
    const text = JSON.stringify(await rows());
    expect(text).not.toContain('audit-private@example.com');
    expect(text).not.toContain(password);
    expect(text).not.toMatch(/passwordHash|refreshToken|\$argon2/i);
  });

  describe('student status', () => {
    it('deactivates, signs the student out everywhere, and reactivates', async () => {
      const { agent: student, id: studentId } = await signIn(
        'status-student@example.com',
        Role.STUDENT,
        'Status Student',
      );
      // A second device for the same student.
      const other = request.agent(apiUrl);
      await call(other, 'post', '/api/v1/auth/login')
        .send({ email: 'status-student@example.com', password })
        .expect(200);
      await call(student, 'get', '/api/v1/auth/me').expect(200);
      await call(other, 'get', '/api/v1/auth/me').expect(200);
      expect(
        await prisma.session.count({
          where: { userId: studentId, revokedAt: null },
        }),
      ).toBeGreaterThan(1);

      const base = `/api/v1/admin/students/${studentId}`;
      const deactivated = await expectOne(
        async () => {
          const response = await post(`${base}/deactivate`).expect(200);
          expect(response.body).toMatchObject({
            id: studentId,
            isActive: false,
          });
          expect(response.headers['cache-control']).toBe('private, no-store');
        },
        {
          action: 'student.deactivate',
          entity: 'Student',
          entityId: studentId,
        },
      );
      expect(deactivated.data).toEqual({});

      // Every session is revoked; the old access tokens stop working on the
      // very next request, not 15 minutes later.
      expect(
        await prisma.session.count({
          where: { userId: studentId, revokedAt: null },
        }),
      ).toBe(0);
      await call(student, 'get', '/api/v1/auth/me').expect(401);
      await call(other, 'get', '/api/v1/auth/me').expect(401);
      await call(student, 'get', '/api/v1/me/levels').expect(401);
      // Signing in again is refused, with the same answer as a bad password.
      await call(undefined, 'post', '/api/v1/auth/login')
        .send({ email: 'status-student@example.com', password })
        .expect(401);

      // Deactivating twice changes nothing and records nothing.
      expect(
        await added(() => post(`${base}/deactivate`).expect(200)),
      ).toHaveLength(0);

      const listed = (
        await call(admin, 'get', '/api/v1/admin/students').expect(200)
      ).body as { students: Array<{ id: string; isActive: boolean }> };
      expect(listed.students.find((s) => s.id === studentId)?.isActive).toBe(
        false,
      );

      await expectOne(
        async () => {
          const response = await post(`${base}/reactivate`).expect(200);
          expect(response.body).toMatchObject({ isActive: true });
        },
        {
          action: 'student.reactivate',
          entity: 'Student',
          entityId: studentId,
        },
      );
      expect(
        await added(() => post(`${base}/reactivate`).expect(200)),
      ).toHaveLength(0);
      // The revoked sessions stay revoked; a fresh login works.
      await call(student, 'get', '/api/v1/auth/me').expect(401);
      const again = request.agent(apiUrl);
      await call(again, 'post', '/api/v1/auth/login')
        .send({ email: 'status-student@example.com', password })
        .expect(200);
      await call(again, 'get', '/api/v1/auth/me').expect(200);
    });

    it('refuses to deactivate yourself, an unknown id, or a non-student', async () => {
      const before = await prisma.auditLog.count();
      await post(`/api/v1/admin/students/${adminId}/deactivate`).expect(409);
      await post(`/api/v1/admin/students/${adminId}/reactivate`).expect(409);
      const missing = '33333333-3333-4333-8333-333333333333';
      await post(`/api/v1/admin/students/${missing}/deactivate`).expect(404);
      await post('/api/v1/admin/students/not-a-uuid/deactivate').expect(400);
      const { id: otherAdmin } = await signIn(
        'status-other-admin@example.com',
        Role.ADMIN,
      );
      await post(`/api/v1/admin/students/${otherAdmin}/deactivate`).expect(404);
      expect(await prisma.auditLog.count()).toBe(before);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: adminId } }))
          .isActive,
      ).toBe(true);
      await call(admin, 'get', '/api/v1/auth/me').expect(200);
    });

    it('shows status, progress, orders and recent history on the student detail', async () => {
      const levelId = await createLevel('detail-level');
      const lessonA = await createLesson(levelId, 'A');
      const lessonB = await createLesson(levelId, 'B');
      await makeLessonPublishable(prisma, lessonA);
      await makeLessonPublishable(prisma, lessonB);
      await post(`/api/v1/admin/lessons/${lessonA}/publish`).expect(200);
      await post(`/api/v1/admin/lessons/${lessonB}/publish`).expect(200);
      await post(`/api/v1/admin/levels/${levelId}/publish`).expect(200);
      const { id: studentId } = await signIn(
        'detail-student@example.com',
        Role.STUDENT,
        'Detail Student',
      );
      await post(`/api/v1/admin/students/${studentId}/enrollments`, {
        levelId,
      }).expect(201);
      await prisma.lessonProgress.create({
        data: { userId: studentId, lessonId: lessonA, completedAt: new Date() },
      });
      await prisma.order.create({
        data: {
          userId: studentId,
          levelId,
          amountMinor: 90_000,
          status: 'PAID',
          paidAt: new Date(),
          specialReference: 'audit-detail-ref',
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      await post(`/api/v1/admin/students/${studentId}/deactivate`).expect(200);

      const detail = (
        await call(admin, 'get', `/api/v1/admin/students/${studentId}`).expect(
          200,
        )
      ).body as {
        isActive: boolean;
        enrollments: Array<{ progress: Json | null }>;
        orders: Array<Json>;
        recentAudit: Array<{ action: string; actor: Json }>;
      };
      expect(detail.isActive).toBe(false);
      expect(detail.enrollments[0]!.progress).toEqual({
        completed: 1,
        total: 2,
      });
      expect(detail.orders).toHaveLength(1);
      expect(detail.orders[0]).toMatchObject({
        status: 'PAID',
        amountMinor: 90_000,
        levelSlug: 'detail-level',
      });
      expect(detail.recentAudit.map((entry) => entry.action)).toEqual([
        'student.deactivate',
        'enrollment.grant',
      ]);
      expect(detail.recentAudit[0]!.actor).toMatchObject({
        name: 'Audit Admin',
      });
    });
  });

  describe('admin overview', () => {
    it('reports counts and integer money for the last 30 days', async () => {
      const levelId = await createLevel('overview-level', {
        priceMinor: 100_000,
      });
      await makeLevelPublishable(prisma, levelId);
      await post(`/api/v1/admin/levels/${levelId}/publish`).expect(200);
      const students = [];
      for (const name of ['one', 'two', 'three']) {
        students.push(
          await signIn(`overview-${name}@example.com`, Role.STUDENT, name),
        );
      }
      // One student signed up long ago.
      await prisma.user.update({
        where: { id: students[2]!.id },
        data: { createdAt: new Date(Date.now() - 45 * 86_400_000) },
      });
      const day = 86_400_000;
      const order = (
        index: number,
        data: {
          userId: string;
          status: 'PAID' | 'PENDING' | 'EXPIRED' | 'REFUNDED';
          amountMinor: number;
          paidAt?: Date;
          expiresAt?: Date;
        },
      ) =>
        prisma.order.create({
          data: {
            levelId,
            specialReference: `overview-${index}`,
            expiresAt: new Date(Date.now() + 3_600_000),
            ...data,
          },
        });
      await order(1, {
        userId: students[0]!.id,
        status: 'PAID',
        amountMinor: 100_000,
        paidAt: new Date(Date.now() - day),
      });
      await order(2, {
        userId: students[1]!.id,
        status: 'PAID',
        amountMinor: 55_050,
        paidAt: new Date(Date.now() - 20 * day),
      });
      // Outside the window, not paid, refunded: none of these count.
      await order(3, {
        userId: students[2]!.id,
        status: 'PAID',
        amountMinor: 70_000,
        paidAt: new Date(Date.now() - 40 * day),
      });
      const refunded = await order(4, {
        userId: students[0]!.id,
        status: 'REFUNDED',
        amountMinor: 11_111,
        paidAt: new Date(Date.now() - 2 * day),
      });
      await order(5, {
        userId: students[1]!.id,
        status: 'PENDING',
        amountMinor: 100_000,
      });
      await order(6, {
        userId: students[1]!.id,
        status: 'EXPIRED',
        amountMinor: 100_000,
        expiresAt: new Date(Date.now() - 3_600_000),
      });
      await prisma.enrollment.create({
        data: {
          userId: students[0]!.id,
          levelId,
          source: 'PURCHASE',
          orderId: refunded.id,
        },
      });
      await post(`/api/v1/admin/students/${students[1]!.id}/enrollments`, {
        levelId,
      }).expect(201);
      await call(
        admin,
        'delete',
        `/api/v1/admin/students/${students[1]!.id}/enrollments/${levelId}`,
      )
        .send({})
        .expect(204);

      const response = await call(
        admin,
        'get',
        '/api/v1/admin/overview',
      ).expect(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.body).toEqual({
        students: { total: 3, newLast30d: 2 },
        enrollments: { active: 1, purchasedLast30d: 2 },
        revenueLast30dMinor: 155_050,
        pendingOrders: 1,
        failedCallbacksLast24h: 0,
        refundedWithAccess: 1,
        video: { active: 'LOCAL', devOnly: false },
        payments: { available: false },
      });
      expect(Number.isInteger(response.body.revenueLast30dMinor)).toBe(true);
      const flagged = await call(
        admin,
        'get',
        '/api/v1/admin/orders?refundedWithAccess=true',
      ).expect(200);
      expect(flagged.body.total).toBe(1);
      expect(flagged.body.orders[0]).toMatchObject({
        id: refunded.id,
        status: 'REFUNDED',
        hasActiveAccess: true,
      });
    });

    it('is all zeroes on an empty school', async () => {
      const response = await call(
        admin,
        'get',
        '/api/v1/admin/overview',
      ).expect(200);
      expect(response.body).toMatchObject({
        students: { total: 0, newLast30d: 0 },
        enrollments: { active: 0, purchasedLast30d: 0 },
        revenueLast30dMinor: 0,
        pendingOrders: 0,
      });
    });
  });
});
