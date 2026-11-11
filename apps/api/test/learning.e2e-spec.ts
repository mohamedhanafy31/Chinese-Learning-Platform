import { fork, type ChildProcess } from 'node:child_process';

import { PrismaPg } from '@prisma/adapter-pg';
import { SignJWT } from 'jose';
import request from 'supertest';
import { Role } from '@app/shared';

import { PrismaClient } from '../src/generated/prisma/client';

const origin = 'http://localhost:3000';
const password = 'initial-password';

type Agent = ReturnType<typeof request.agent>;
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Json = Record<string, unknown>;

const keys = (value: unknown): string[] => Object.keys(value as Json).sort();

describe('learning API (e2e)', () => {
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
        `198.51.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`,
      );
  }

  async function signIn(
    email: string,
    role: Role,
    name = 'Learning User',
  ): Promise<{ agent: Agent; id: string }> {
    const agent = request.agent(apiUrl);
    phoneCounter += 1;
    await call(agent, 'post', '/api/v1/auth/register')
      .send({
        email,
        password,
        name,
        phone: `+2010${String(1_000_000 + phoneCounter)}`,
      })
      .expect(201);
    const user = await prisma.user.update({
      where: { email },
      data: { role },
    });
    await call(agent, 'post', '/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return { agent, id: user.id };
  }

  async function createLevel(slug: string, extra: Json = {}): Promise<Json> {
    const response = await call(admin, 'post', '/api/v1/admin/levels')
      .send({
        slug,
        hanzi: '入门',
        title: { en: `Title ${slug}` },
        summary: { en: 'Summary' },
        ...extra,
      })
      .expect(201);
    return response.body as Json;
  }

  async function createLesson(
    levelId: string,
    title: string,
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

  async function verb(
    kind: 'levels' | 'lessons',
    id: string,
    action: 'publish' | 'unpublish' | 'archive' | 'unarchive',
  ): Promise<void> {
    await call(admin, 'post', `/api/v1/admin/${kind}/${id}/${action}`).expect(
      200,
    );
  }

  /** A published level with a free preview, a locked lesson and an unpublished one. */
  async function seedLevel(slug: string): Promise<{
    id: string;
    preview: string;
    locked: string;
    hidden: string;
  }> {
    const level = await createLevel(slug);
    const id = level.id as string;
    const preview = await createLesson(id, 'Preview', { isFreePreview: true });
    const locked = await createLesson(id, 'Locked');
    const hidden = await createLesson(id, 'Hidden');
    await verb('lessons', preview.id as string, 'publish');
    await verb('lessons', locked.id as string, 'publish');
    await verb('levels', id, 'publish');
    return {
      id,
      preview: preview.id as string,
      locked: locked.id as string,
      hidden: hidden.id as string,
    };
  }

  const grant = (studentId: string, levelId: string) =>
    call(admin, 'post', `/api/v1/admin/students/${studentId}/enrollments`).send(
      { levelId },
    );

  const revoke = (studentId: string, levelId: string, body?: Json) =>
    call(
      admin,
      'delete',
      `/api/v1/admin/students/${studentId}/enrollments/${levelId}`,
    ).send(body ?? {});

  const accessOf = (agent: Agent | undefined, slug: string) =>
    call(agent, 'get', `/api/v1/catalog/levels/${slug}/access`);

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
    // This suite can run after the browser suite against the same app_test
    // database, so remove every dependent row before its catalog fixtures.
    await prisma.auditLog.deleteMany();
    await prisma.paymentTransaction.deleteMany();
    await prisma.order.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.quizAttempt.deleteMany();
    await prisma.lessonProgress.deleteMany();
    await prisma.videoAsset.deleteMany();
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
      'learning-admin@example.com',
      Role.ADMIN,
      'Learning Admin',
    );
    admin = signedIn.agent;
    adminId = signedIn.id;
  });

  afterAll(async () => {
    await clean();
    await prisma?.$disconnect();
    if (child?.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    }
  });

  it('rejects anonymous callers with 401 and students with 403 on admin routes', async () => {
    const { agent: student } = await signIn(
      'learning-student@example.com',
      Role.STUDENT,
    );
    const id = '11111111-1111-4111-8111-111111111111';
    const routes: [Method, string][] = [
      ['get', '/api/v1/admin/students'],
      ['get', `/api/v1/admin/students/${id}`],
      ['post', `/api/v1/admin/students/${id}/enrollments`],
      ['delete', `/api/v1/admin/students/${id}/enrollments/${id}`],
    ];
    for (const [method, path] of routes) {
      await call(undefined, method, path).send({}).expect(401);
      await call(student, method, path).send({}).expect(403);
    }
    await call(undefined, 'get', '/api/v1/me/levels').expect(401);
    await call(undefined, 'get', '/api/v1/me/levels/anything').expect(401);
  });

  it('grants, revokes and reactivates idempotently', async () => {
    const level = await seedLevel('grant-level');
    const { id: studentId } = await signIn(
      'grantee@example.com',
      Role.STUDENT,
      'Grantee',
    );

    const first = await grant(studentId, level.id).expect(201);
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(keys(first.body)).toEqual(
      [
        'activeEnrollments',
        'createdAt',
        'email',
        'enrollments',
        'id',
        'isActive',
        'name',
        'orders',
        'phone',
        'recentAudit',
      ].sort(),
    );
    expect(first.body.activeEnrollments).toBe(1);
    expect(first.body.isActive).toBe(true);
    expect(first.body.orders).toEqual([]);
    expect(first.body.recentAudit).toHaveLength(1);
    expect(keys(first.body.enrollments[0])).toEqual(
      [
        'createdAt',
        'grantedByName',
        'id',
        'level',
        'levelId',
        'progress',
        'revokeReason',
        'revokedAt',
        'source',
      ].sort(),
    );
    expect(keys(first.body.enrollments[0].level)).toEqual([
      'hanzi',
      'slug',
      'title',
    ]);
    expect(first.body.enrollments[0].progress).toEqual({
      completed: 0,
      total: 2,
    });
    const enrollmentId = first.body.enrollments[0].id as string;
    expect(first.body.enrollments[0]).toMatchObject({
      levelId: level.id,
      source: 'ADMIN',
      grantedByName: 'Learning Admin',
      revokedAt: null,
      revokeReason: null,
    });

    // Granting an active enrollment is a no-op that returns the same row.
    const again = await grant(studentId, level.id).expect(201);
    expect(again.body.enrollments).toHaveLength(1);
    expect(again.body.enrollments[0].id).toBe(enrollmentId);
    expect(again.body.enrollments[0].createdAt).toBe(
      first.body.enrollments[0].createdAt,
    );

    await revoke(studentId, level.id, { reason: '  Refunded by hand  ' })
      .expect(204)
      .expect('Cache-Control', 'private, no-store');
    let detail = (
      await call(admin, 'get', `/api/v1/admin/students/${studentId}`).expect(
        200,
      )
    ).body;
    expect(detail.activeEnrollments).toBe(0);
    expect(detail.enrollments).toHaveLength(1);
    expect(detail.enrollments[0]).toMatchObject({
      id: enrollmentId,
      revokeReason: 'Refunded by hand',
    });
    expect(typeof detail.enrollments[0].revokedAt).toBe('string');
    const revokedAt = detail.enrollments[0].revokedAt as string;

    // Revoking again changes nothing; the first reason and date stay.
    await revoke(studentId, level.id, { reason: 'Second reason' }).expect(204);
    detail = (
      await call(admin, 'get', `/api/v1/admin/students/${studentId}`).expect(
        200,
      )
    ).body;
    expect(detail.enrollments[0]).toMatchObject({
      revokedAt,
      revokeReason: 'Refunded by hand',
    });

    // Reactivation reuses the row and clears the revocation.
    const reactivated = await grant(studentId, level.id).expect(201);
    expect(reactivated.body.enrollments).toHaveLength(1);
    expect(reactivated.body.enrollments[0]).toMatchObject({
      id: enrollmentId,
      revokedAt: null,
      revokeReason: null,
      source: 'ADMIN',
    });
    expect(await prisma.enrollment.count()).toBe(1);
    const row = await prisma.enrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
    });
    expect(row).toMatchObject({
      revokedById: null,
      grantedById: adminId,
      source: 'ADMIN',
    });

    // Revoking with no body, or when no enrollment exists, is also a 204.
    await call(
      admin,
      'delete',
      `/api/v1/admin/students/${studentId}/enrollments/${level.id}`,
    ).expect(204);
    const other = await seedLevel('never-granted');
    await revoke(studentId, other.id).expect(204);
    expect(await prisma.enrollment.count()).toBe(1);
    expect(
      (
        await prisma.enrollment.findUniqueOrThrow({
          where: { id: enrollmentId },
        })
      ).revokeReason,
    ).toBeNull();
  });

  it('validates grant and revoke requests', async () => {
    const level = await seedLevel('validate-level');
    const { id: studentId } = await signIn(
      'validate@example.com',
      Role.STUDENT,
    );
    const missing = '99999999-9999-4999-8999-999999999999';

    await grant(missing, level.id).expect(404);
    await grant(studentId, missing).expect(404);
    await grant(adminId, level.id).expect(400);
    await call(admin, 'post', `/api/v1/admin/students/${studentId}/enrollments`)
      .send({})
      .expect(400);
    await call(admin, 'post', `/api/v1/admin/students/${studentId}/enrollments`)
      .send({ levelId: 'nope' })
      .expect(400);
    await call(admin, 'post', '/api/v1/admin/students/not-a-uuid/enrollments')
      .send({ levelId: level.id })
      .expect(400);
    await call(admin, 'get', '/api/v1/admin/students/not-a-uuid').expect(400);
    await call(admin, 'get', `/api/v1/admin/students/${missing}`).expect(404);
    // Administrators are not students.
    await call(admin, 'get', `/api/v1/admin/students/${adminId}`).expect(404);

    // A never-published draft, and a level pulled back after publishing, are 409.
    const draft = await createLevel('draft-level');
    await grant(studentId, draft.id as string).expect(409);
    await verb('levels', level.id, 'unpublish');
    await grant(studentId, level.id).expect(409);
    // Archived levels may be granted.
    await verb('levels', level.id, 'archive');
    await grant(studentId, level.id).expect(201);

    await revoke(missing, level.id).expect(404);
    await revoke(studentId, missing).expect(404);
    await revoke(studentId, level.id, { reason: 'x'.repeat(501) }).expect(400);
    await revoke(studentId, level.id, { reason: 'x'.repeat(500) }).expect(204);
    expect(await prisma.enrollment.count()).toBe(1);
  });

  it('searches students case-insensitively and paginates newest first', async () => {
    const level = await seedLevel('search-level');
    const people: [string, string][] = [
      ['amal.one@example.com', 'Amal Hassan'],
      ['bassem.two@example.com', 'Bassem Nour'],
      ['carla.three@example.com', 'Carla Samir'],
      ['dina.four@example.org', 'Dina Hassan'],
      ['eman.five@example.com', 'Eman Fouad'],
    ];
    const ids: string[] = [];
    for (const [email, name] of people) {
      const { id } = await signIn(email, Role.STUDENT, name);
      ids.push(id);
      // createdAt must differ for a stable "newest first" assertion.
      await prisma.user.update({
        where: { id },
        data: { createdAt: new Date(Date.UTC(2026, 0, ids.length)) },
      });
    }
    await grant(ids[0] as string, level.id).expect(201);

    const all = await call(admin, 'get', '/api/v1/admin/students').expect(200);
    expect(all.headers['cache-control']).toBe('private, no-store');
    expect(keys(all.body)).toEqual(['page', 'pageSize', 'students', 'total']);
    expect(all.body).toMatchObject({ total: 5, page: 1, pageSize: 20 });
    expect(all.body.students.map((s: Json) => s.name)).toEqual([
      'Eman Fouad',
      'Dina Hassan',
      'Carla Samir',
      'Bassem Nour',
      'Amal Hassan',
    ]);
    expect(keys(all.body.students[0])).toEqual([
      'activeEnrollments',
      'createdAt',
      'email',
      'id',
      'isActive',
      'name',
      'phone',
    ]);
    expect(
      all.body.students.map((s: Json) => [s.name, s.activeEnrollments]),
    ).toContainEqual(['Amal Hassan', 1]);
    // The admin account is never listed.
    expect(JSON.stringify(all.body)).not.toContain('learning-admin');

    const byName = await call(
      admin,
      'get',
      '/api/v1/admin/students?query=hASSAN',
    ).expect(200);
    expect(byName.body.total).toBe(2);
    expect(byName.body.students.map((s: Json) => s.name)).toEqual([
      'Dina Hassan',
      'Amal Hassan',
    ]);
    const byEmail = await call(
      admin,
      'get',
      '/api/v1/admin/students?query=BASSEM.TWO@',
    ).expect(200);
    expect(byEmail.body.students.map((s: Json) => s.name)).toEqual([
      'Bassem Nour',
    ]);
    const byPhone = await call(
      admin,
      'get',
      `/api/v1/admin/students?query=${encodeURIComponent('+2010 1000-004')}`,
    ).expect(200);
    expect(byPhone.body.students.map((s: Json) => s.name)).toEqual([
      'Carla Samir',
    ]);
    const none = await call(
      admin,
      'get',
      '/api/v1/admin/students?query=zzzzzz',
    ).expect(200);
    expect(none.body).toMatchObject({ students: [], total: 0 });

    const pageOne = await call(
      admin,
      'get',
      '/api/v1/admin/students?page=1&pageSize=2',
    ).expect(200);
    const pageThree = await call(
      admin,
      'get',
      '/api/v1/admin/students?page=3&pageSize=2',
    ).expect(200);
    const pageNine = await call(
      admin,
      'get',
      '/api/v1/admin/students?page=9&pageSize=2',
    ).expect(200);
    expect(pageOne.body).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    expect(pageOne.body.students.map((s: Json) => s.name)).toEqual([
      'Eman Fouad',
      'Dina Hassan',
    ]);
    expect(pageThree.body.students.map((s: Json) => s.name)).toEqual([
      'Amal Hassan',
    ]);
    expect(pageNine.body).toMatchObject({ students: [], total: 5, page: 9 });

    await call(admin, 'get', '/api/v1/admin/students?pageSize=51').expect(400);
    await call(admin, 'get', '/api/v1/admin/students?pageSize=50').expect(200);
    await call(admin, 'get', '/api/v1/admin/students?page=0').expect(400);
    await call(admin, 'get', '/api/v1/admin/students?page=abc').expect(400);
    // Blank parameters fall back to the defaults.
    await call(admin, 'get', '/api/v1/admin/students?query=&page=&pageSize=')
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ total: 5, page: 1, pageSize: 20 }),
      );
  });

  it('lists my levels: active, published or archived, in level order', async () => {
    const one = await seedLevel('mine-one');
    const two = await seedLevel('mine-two');
    const three = await seedLevel('mine-three');
    const four = await seedLevel('mine-four');
    const { agent, id } = await signIn('mine@example.com', Role.STUDENT);

    const empty = await call(agent, 'get', '/api/v1/me/levels')
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(empty.body).toEqual({ levels: [] });

    // Grant in reverse so the order must come from the level, not the grant.
    for (const level of [four, three, two, one]) {
      await grant(id, level.id).expect(201);
    }
    // Archive "two" (kept), pull "three" back to draft (hidden), revoke "four".
    await verb('levels', two.id, 'archive');
    await verb('levels', three.id, 'unpublish');
    await revoke(id, four.id).expect(204);

    const response = await call(agent, 'get', '/api/v1/me/levels').expect(200);
    expect(keys(response.body)).toEqual(['levels']);
    expect(response.body.levels).toHaveLength(2);
    expect(keys(response.body.levels[0])).toEqual(
      [
        'archived',
        'coverImage',
        'enrolledAt',
        'hanzi',
        'lessonCount',
        'number',
        'progress',
        'slug',
        'summary',
        'title',
      ].sort(),
    );
    expect(
      response.body.levels.map((l: Json) => [
        l.slug,
        l.number,
        l.archived,
        l.lessonCount,
      ]),
    ).toEqual([
      ['mine-one', 1, false, 2],
      ['mine-two', null, true, 2],
    ]);
    expect(response.body.levels[0]).toMatchObject({
      hanzi: '入门',
      title: { en: 'Title mine-one' },
      coverImage: null,
    });

    // Another student sees nothing of it.
    const { agent: other } = await signIn('other@example.com', Role.STUDENT);
    expect(
      (await call(other, 'get', '/api/v1/me/levels').expect(200)).body,
    ).toEqual({ levels: [] });

    // Full detail of an owned level, including an archived one.
    const detail = await call(agent, 'get', '/api/v1/me/levels/mine-two')
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(detail.body).toMatchObject({
      slug: 'mine-two',
      number: null,
      archived: true,
    });
    expect(detail.body.lessons.map((l: Json) => l.number)).toEqual([1, 2]);
    await call(agent, 'get', '/api/v1/me/levels/mine-three').expect(404);
    await call(agent, 'get', '/api/v1/me/levels/mine-four').expect(404);
    await call(other, 'get', '/api/v1/me/levels/mine-one').expect(404);
  });

  it('answers per-lesson access for anonymous, students, owners and admins', async () => {
    const level = await seedLevel('access-level');
    const slug = 'access-level';
    const { agent: stranger } = await signIn(
      'stranger@example.com',
      Role.STUDENT,
    );
    const { agent: owner, id: ownerId } = await signIn(
      'owner@example.com',
      Role.STUDENT,
    );
    await grant(ownerId, level.id).expect(201);
    const ids = [level.preview, level.locked];

    const anonymous = await accessOf(undefined, slug)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(keys(anonymous.body)).toEqual(['enrolled', 'lessons', 'progress']);
    expect(keys(anonymous.body.lessons[0])).toEqual(['access', 'id']);
    expect(anonymous.body).toEqual({
      enrolled: false,
      lessons: [
        { id: level.preview, access: 'preview' },
        { id: level.locked, access: 'locked' },
      ],
      progress: null,
    });
    // The unpublished lesson never appears.
    expect(JSON.stringify(anonymous.body)).not.toContain(level.hidden);

    expect((await accessOf(stranger, slug).expect(200)).body).toEqual(
      anonymous.body,
    );

    const ownerBody = (await accessOf(owner, slug).expect(200)).body;
    // M12: an enrolled learner sees the sequence, not `open`: the free preview
    // stays a preview, the first regular lesson is the next one.
    expect(ownerBody).toEqual({
      enrolled: true,
      lessons: [
        { id: level.preview, access: 'preview' },
        { id: level.locked, access: 'next' },
      ],
      progress: { completed: 0, total: 2, nextLessonId: level.locked },
    });

    // Staff get the learner view here: no enrollment, previews and locks.
    expect((await accessOf(admin, slug).expect(200)).body).toEqual(
      anonymous.body,
    );

    // Same set and order as the public detail.
    const publicDetail = await call(
      undefined,
      'get',
      `/api/v1/catalog/levels/${slug}`,
    ).expect(200);
    expect(publicDetail.body.lessons.map((l: Json) => l.id)).toEqual(ids);

    // Revocation locks everything but previews again.
    await revoke(ownerId, level.id).expect(204);
    expect((await accessOf(owner, slug).expect(200)).body).toEqual(
      anonymous.body,
    );

    // An unpublished lesson stays hidden even for owners, until it is published.
    await grant(ownerId, level.id).expect(201);
    await verb('lessons', level.hidden, 'publish');
    expect(
      (await accessOf(owner, slug).expect(200)).body.lessons.map(
        (l: Json) => l.id,
      ),
    ).toEqual([level.preview, level.locked, level.hidden]);
    await verb('lessons', level.hidden, 'unpublish');
    await verb('lessons', level.locked, 'archive');
    expect((await accessOf(owner, slug).expect(200)).body.lessons).toEqual([
      { id: level.preview, access: 'next' },
    ]);
    await verb('lessons', level.locked, 'unarchive');

    // Unknown levels 404.
    await accessOf(undefined, 'does-not-exist').expect(404);
  });

  it('hides draft and archived levels from everyone but their owners', async () => {
    const level = await seedLevel('archive-access');
    const slug = 'archive-access';
    const { agent: owner, id: ownerId } = await signIn(
      'archive-owner@example.com',
      Role.STUDENT,
    );
    const { agent: stranger } = await signIn(
      'archive-stranger@example.com',
      Role.STUDENT,
    );
    await grant(ownerId, level.id).expect(201);

    await verb('levels', level.id, 'archive');
    await accessOf(undefined, slug).expect(404);
    await accessOf(stranger, slug).expect(404);
    await accessOf(admin, slug).expect(404);
    const kept = (await accessOf(owner, slug).expect(200)).body;
    expect(kept).toEqual({
      enrolled: true,
      lessons: [
        { id: level.preview, access: 'preview' },
        { id: level.locked, access: 'next' },
      ],
      progress: { completed: 0, total: 2, nextLessonId: level.locked },
    });

    // Unarchived but pulled back to draft: unavailable to owners as well.
    await verb('levels', level.id, 'unarchive');
    await verb('levels', level.id, 'unpublish');
    await accessOf(owner, slug).expect(404);
    await accessOf(undefined, slug).expect(404);

    // Archived and unpublished: owners keep it (buyers keep archived levels).
    await verb('levels', level.id, 'archive');
    await accessOf(owner, slug).expect(200);
    await accessOf(stranger, slug).expect(404);
  });

  it('treats an expired, garbage or revoked access cookie as anonymous on optional routes', async () => {
    const level = await seedLevel('optional-auth');
    const { agent: owner, id: ownerId } = await signIn(
      'optional@example.com',
      Role.STUDENT,
    );
    await grant(ownerId, level.id).expect(201);
    const session = await prisma.session.findFirstOrThrow({
      where: { userId: ownerId },
      orderBy: { createdAt: 'desc' },
    });

    const secret = new TextEncoder().encode(
      process.env.JWT_ACCESS_SECRET ?? '',
    );
    const expired = await new SignJWT({ role: 'STUDENT', sid: session.id })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(ownerId)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret);
    const valid = await new SignJWT({ role: 'STUDENT', sid: session.id })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(ownerId)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);

    const withCookie = (token: string) =>
      call(undefined, 'get', '/api/v1/catalog/levels/optional-auth/access').set(
        'Cookie',
        `access_token=${token}`,
      );

    // Sanity: a hand-made valid cookie is accepted as the owner.
    expect((await withCookie(valid).expect(200)).body.enrolled).toBe(true);
    for (const token of [expired, 'garbage', 'a.b.c']) {
      const body = (await withCookie(token).expect(200)).body;
      expect(body.enrolled).toBe(false);
      expect(body.lessons.map((l: Json) => l.access)).toEqual([
        'preview',
        'locked',
      ]);
    }
    // The same cookies still fail on a required route.
    await call(undefined, 'get', '/api/v1/me/levels')
      .set('Cookie', 'access_token=garbage')
      .expect(401);
    await call(undefined, 'get', '/api/v1/me/levels')
      .set('Cookie', `access_token=${expired}`)
      .expect(401);

    // A session revoked by logout no longer grants anything.
    await call(owner, 'post', '/api/v1/auth/logout').expect(204);
    expect((await withCookie(valid).expect(200)).body.enrolled).toBe(false);
  });
});
