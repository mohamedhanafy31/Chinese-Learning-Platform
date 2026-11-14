import { randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { Role } from '@app/shared';

import { PrismaClient } from '../src/generated/prisma/client';
import {
  archivePublishableContent,
  makeLessonPublishable,
} from './publishable-content';

const origin = 'http://localhost:3000';
const password = 'initial-password';

type Agent = ReturnType<typeof request.agent>;
type Method = 'get' | 'head' | 'post' | 'put' | 'patch' | 'delete';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface SeededQuiz {
  id: string;
  questions: { id: string; options: { id: string; isCorrect: boolean }[] }[];
}

interface SeededLesson {
  id: string;
  assetId: string | null;
}

const opt = (text: string, isCorrect = false) => ({
  text: { en: text },
  isCorrect,
});

describe('progress and sequential unlocking (e2e)', () => {
  let apiUrl: string;
  let child: ChildProcess;
  let childOutput = '';
  let prisma: PrismaClient;
  let admin: Agent;
  let ipCounter = 0;
  let phoneCounter = 0;

  function call(agent: Agent | undefined, method: Method, path: string) {
    ipCounter += 1;
    const target = agent ? agent[method](path) : request(apiUrl)[method](path);
    return target
      .set('Origin', origin)
      .set(
        'X-Forwarded-For',
        `203.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`,
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
        name: 'Progress User',
        phone: `+2012${String(10_000_000 + phoneCounter)}`,
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

  async function createLevel(slug: string): Promise<string> {
    const response = await call(admin, 'post', '/api/v1/admin/levels')
      .send({
        slug,
        hanzi: '入门',
        title: { en: `Title ${slug}` },
        summary: { en: 'Summary' },
      })
      .expect(201);
    return response.body.id as string;
  }

  const verb = async (
    kind: 'levels' | 'lessons',
    id: string,
    action: 'publish' | 'unpublish' | 'archive' | 'unarchive',
  ) => {
    const quizId =
      kind === 'lessons' && action === 'publish'
        ? await makeLessonPublishable(prisma, id)
        : null;
    const response = await call(
      admin,
      'post',
      `/api/v1/admin/${kind}/${id}/${action}`,
    ).expect(200);
    if (quizId) await archivePublishableContent(prisma, quizId);
    return response;
  };

  /** A lesson, published, with an optional READY LOCAL video row and file. */
  async function createLesson(
    levelId: string,
    title: string,
    options: { video?: number | 'unknown'; preview?: boolean } = {},
  ): Promise<SeededLesson> {
    const response = await call(
      admin,
      'post',
      `/api/v1/admin/levels/${levelId}/lessons`,
    )
      .send({ title: { en: title }, isFreePreview: options.preview ?? false })
      .expect(201);
    const id = response.body.id as string;
    await verb('lessons', id, 'publish');
    let assetId: string | null = null;
    if (options.video !== undefined) {
      assetId = randomUUID();
      const localKey = `${assetId}.mp4`;
      const videosDir = path.join(process.env.UPLOADS_DIR ?? '', 'videos');
      await mkdir(videosDir, { recursive: true });
      await writeFile(path.join(videosDir, localKey), Buffer.alloc(64, 1));
      await prisma.videoAsset.create({
        data: {
          id: assetId,
          lessonId: id,
          provider: 'LOCAL',
          status: 'READY',
          localKey,
          mime: 'video/mp4',
          durationSec: options.video === 'unknown' ? null : options.video,
          sizeBytes: BigInt(64),
          originalName: 'lesson.mp4',
        },
      });
      await prisma.lesson.update({
        where: { id },
        data: { activeVideoId: assetId },
      });
    }
    return { id, assetId };
  }

  async function seedQuiz(lessonId: string): Promise<SeededQuiz> {
    const created = await call(
      admin,
      'post',
      `/api/v1/admin/lessons/${lessonId}/quizzes`,
    )
      .send({ title: { en: 'Quiz' } })
      .expect(201);
    const id = created.body.id as string;
    await call(admin, 'post', `/api/v1/admin/quizzes/${id}/questions`)
      .send({
        type: 'SINGLE',
        prompt: { en: 'Pick the greeting' },
        points: 1,
        options: [opt('Hello', true), opt('Goodbye')],
      })
      .expect(201);
    const detail = await call(admin, 'get', `/api/v1/admin/quizzes/${id}`);
    return {
      id,
      questions: (detail.body.questions as Json[]).map((question) => ({
        id: question.id as string,
        options: question.options as { id: string; isCorrect: boolean }[],
      })),
    };
  }

  const answers = (quiz: SeededQuiz, correct: boolean) => ({
    answers: quiz.questions.map((question) => ({
      questionId: question.id,
      optionIds: question.options
        .filter((option) => option.isCorrect === correct)
        .map((option) => option.id)
        .slice(0, 1),
    })),
  });

  const passQuiz = (agent: Agent, quiz: SeededQuiz) =>
    call(agent, 'post', `/api/v1/quizzes/${quiz.id}/attempts`)
      .send(answers(quiz, true))
      .expect(201);

  function reevaluate(userId: string, lessonId: string): Promise<void> {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const onMessage = (message: {
        type: string;
        requestId?: string;
        error?: string;
      }) => {
        if (message.requestId !== requestId) return;
        child.off('message', onMessage);
        if (message.type === 'error') reject(new Error(message.error));
        else resolve();
      };
      child.on('message', onMessage);
      child.send({ type: 'progress:reevaluate', requestId, userId, lessonId });
    });
  }

  const grant = (studentId: string, levelId: string) =>
    call(admin, 'post', `/api/v1/admin/students/${studentId}/enrollments`)
      .send({ levelId })
      .expect(201);

  const playback = (agent: Agent | undefined, lessonId: string) =>
    call(agent, 'get', `/api/v1/lessons/${lessonId}/playback`);

  const report = (agent: Agent | undefined, lessonId: string, body: Json) =>
    call(agent, 'post', `/api/v1/lessons/${lessonId}/progress`).send(body);

  /** What the lesson page sends once it is shown: an empty report (POST). */
  const opened = (agent: Agent, lessonId: string) =>
    report(agent, lessonId, { segments: [], positionSec: 0 }).expect(200);

  /**
   * Pretends `secondsAgo` of real time passed: the last report moves to then,
   * and the first report moves back by the same amount, so both the
   * per-report clamp and the 2x total ceiling see the elapsed time.
   */
  async function age(studentId: string, lessonId: string, secondsAgo: number) {
    await prisma.lessonProgress.updateMany({
      where: { userId: studentId, lessonId },
      data: { lastReportAt: new Date(Date.now() - secondsAgo * 1000) },
    });
    await prisma.$executeRaw`UPDATE "LessonProgress" SET "createdAt" = "createdAt" - make_interval(secs => ${secondsAgo}) WHERE "userId" = ${studentId}::uuid AND "lessonId" = ${lessonId}::uuid`;
  }

  /** Watches `[from, to]` the way a player would: in honest 20 s reports. */
  async function watch(
    agent: Agent,
    studentId: string,
    lessonId: string,
    from: number,
    to: number,
  ): Promise<Json> {
    let last: Json = {};
    for (let start = from; start < to; start += 20) {
      const end = Math.min(to, start + 20);
      await age(studentId, lessonId, 25);
      const response = await report(agent, lessonId, {
        segments: [[start, end]],
        positionSec: end,
      }).expect(200);
      last = response.body as Json;
    }
    return last;
  }

  const accessMap = (body: Json): Record<string, string> =>
    Object.fromEntries(
      (body.siblings as Json[]).map((s) => [
        s.id as string,
        s.access as string,
      ]),
    );

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
    await prisma.paymentTransaction.deleteMany();
    await prisma.order.deleteMany();
    await prisma.quizAttempt.deleteMany();
    await prisma.quiz.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.videoAsset.deleteMany();
    await prisma.level.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  }

  beforeEach(async () => {
    await clean();
    phoneCounter = 0;
    admin = (await signIn('progress-admin@example.com', Role.ADMIN)).agent;
  });

  afterAll(async () => {
    await clean();
    await prisma?.$disconnect();
    if (child?.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    }
  });

  it('accumulates and clamps reports, completes at 90 % plus a passed quiz, and unlocks the next lesson', async () => {
    const levelId = await createLevel('prog-seq');
    const l1 = await createLesson(levelId, 'One', { video: 100 });
    const l2 = await createLesson(levelId, 'Two', { video: 100 });
    const l3 = await createLesson(levelId, 'Three');
    const quiz2 = await seedQuiz(l2.id);
    await verb('levels', levelId, 'publish');
    const { agent: student, id: studentId } = await signIn(
      'seq-student@example.com',
      Role.STUDENT,
    );
    await grant(studentId, levelId);

    // Lesson 2 is sequence-locked on every surface before lesson 1 is done.
    const locked = { reason: 'sequence-locked', levelSlug: 'prog-seq' };
    const lockedPlayback = await playback(student, l2.id).expect(403);
    expect(lockedPlayback.body).toMatchObject({
      ...locked,
      requiredLessonId: l1.id,
    });
    expect(lockedPlayback.headers['cache-control']).toBe('private, no-store');
    const lockedStream = await call(
      student,
      'get',
      `/api/v1/videos/${l2.assetId}/stream`,
    ).expect(403);
    expect(lockedStream.body).toMatchObject({
      ...locked,
      requiredLessonId: l1.id,
    });
    await call(student, 'head', `/api/v1/videos/${l2.assetId}/stream`).expect(
      403,
    );
    expect(
      (
        await call(student, 'get', `/api/v1/lessons/${l2.id}/quizzes`).expect(
          403,
        )
      ).body,
    ).toMatchObject(locked);
    expect(
      (await call(student, 'get', `/api/v1/quizzes/${quiz2.id}`).expect(403))
        .body,
    ).toMatchObject(locked);
    expect(
      (
        await call(student, 'post', `/api/v1/quizzes/${quiz2.id}/attempts`)
          .send(answers(quiz2, true))
          .expect(403)
      ).body,
    ).toMatchObject(locked);
    expect(
      (
        await report(student, l2.id, {
          segments: [[0, 10]],
          positionSec: 10,
        }).expect(403)
      ).body,
    ).toMatchObject(locked);
    expect(await prisma.quizAttempt.count()).toBe(0);

    // Lesson 1 opens as the next lesson, with an empty progress.
    const first = await playback(student, l1.id).expect(200);
    expect(accessMap(first.body)).toEqual({
      [l1.id]: 'next',
      [l2.id]: 'locked',
      [l3.id]: 'locked',
    });
    expect(first.body.progress).toEqual({
      watchedPercent: 0,
      lastPositionSec: 0,
      videoComplete: false,
      complete: false,
      quizzes: { total: 0, passed: 0 },
      hasVideo: true,
      // This lesson is the sequence's next one itself, so nothing follows yet.
      nextLessonId: null,
    });

    // Validation: out of range, too precise, too many, negative.
    for (const body of [
      { segments: [[0, 5000]], positionSec: 5 },
      { segments: [[-1, 5]], positionSec: 5 },
      { segments: [[5, 2]], positionSec: 5 },
      { segments: [[0, 5.123]], positionSec: 5 },
      { segments: Array.from({ length: 21 }, () => [0, 1]), positionSec: 5 },
      { segments: [], positionSec: -1 },
      { positionSec: 1 },
    ]) {
      await report(student, l1.id, body).expect(400);
    }
    expect(await prisma.lessonProgress.count()).toBe(0);

    // The first report may add 30 s at most; a huge segment is cut to that.
    const huge = await report(student, l1.id, {
      segments: [[0, 100]],
      positionSec: 100,
    }).expect(200);
    expect(huge.headers['cache-control']).toBe('private, no-store');
    expect(huge.body).toEqual({
      watchedPercent: 30,
      videoComplete: false,
      complete: false,
      nextLessonId: null,
    });
    // Repeating what was watched adds nothing, and fast reports are capped.
    const again = await report(student, l1.id, {
      segments: [
        [0, 30],
        [10, 20],
      ],
      positionSec: 30,
    }).expect(200);
    expect(again.body.watchedPercent).toBe(30);
    const burst = await report(student, l1.id, {
      segments: [[30, 100]],
      positionSec: 100,
    }).expect(200);
    // A burst right after the first report gains nothing: total coverage is
    // capped at 30 s plus twice the real time since the first report.
    expect(burst.body.watchedPercent).toBe(30);
    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { userId_lessonId: { userId: studentId, lessonId: l1.id } },
    });
    expect(row).toMatchObject({
      watchedSec: 30,
      durationSec: 100,
      lastPositionSec: 100,
      videoCompletedAt: null,
      completedAt: null,
    });
    // Real time between the requests adds a fraction of a second at 2x.
    const [from, to] = (row.watchedSegments as [number, number][])[0] ?? [];
    expect(from).toBe(0);
    expect(to).toBeGreaterThanOrEqual(30);
    expect(to).toBeLessThan(31);

    // 89 % is not enough; 90 % completes the video and, with no quiz, the lesson.
    await age(studentId, l1.id, 60);
    const near = await report(student, l1.id, {
      segments: [[30, 89]],
      positionSec: 89,
    }).expect(200);
    expect(near.body).toMatchObject({
      watchedPercent: 89,
      videoComplete: false,
      complete: false,
    });
    await age(studentId, l1.id, 20);
    const done = await report(student, l1.id, {
      segments: [[89, 90]],
      positionSec: 90,
    }).expect(200);
    expect(done.body).toEqual({
      watchedPercent: 90,
      videoComplete: true,
      complete: true,
      nextLessonId: l2.id,
    });

    // Lesson 2 is open now on every surface; lesson 3 waits for lesson 2.
    const second = await playback(student, l2.id).expect(200);
    expect(accessMap(second.body)).toEqual({
      [l1.id]: 'done',
      [l2.id]: 'next',
      [l3.id]: 'locked',
    });
    expect(second.body.progress.quizzes).toEqual({ total: 1, passed: 0 });
    await call(student, 'get', `/api/v1/videos/${l2.assetId}/stream`).expect(
      200,
    );
    await call(student, 'get', `/api/v1/lessons/${l2.id}/quizzes`).expect(200);
    await call(student, 'get', `/api/v1/quizzes/${quiz2.id}`).expect(200);
    expect((await playback(student, l3.id).expect(403)).body).toMatchObject({
      ...locked,
      requiredLessonId: l2.id,
    });

    // A failed attempt changes nothing; a pass alone does not finish a lesson
    // whose video is unwatched.
    await call(student, 'post', `/api/v1/quizzes/${quiz2.id}/attempts`)
      .send(answers(quiz2, false))
      .expect(201);
    expect(
      (await playback(student, l2.id).expect(200)).body.progress.complete,
    ).toBe(false);
    await passQuiz(student, quiz2);
    const quizOnly = await playback(student, l2.id).expect(200);
    expect(quizOnly.body.progress).toMatchObject({
      quizzes: { total: 1, passed: 1 },
      videoComplete: false,
      complete: false,
    });
    await playback(student, l3.id).expect(403);

    // Watching 90 % on top of the passed quiz completes lesson 2.
    const watched = await watch(student, studentId, l2.id, 0, 90);
    expect(watched).toMatchObject({ videoComplete: true, complete: true });
    expect(watched.nextLessonId).toBe(l3.id);

    // Lesson 3 has neither a video nor a quiz, so it can never count as done.
    const peek = await playback(student, l3.id).expect(404);
    expect(peek.body.progress.complete).toBe(false);
    expect((await opened(student, l3.id)).body.complete).toBe(false);
    const third = await playback(student, l3.id).expect(404);
    expect(third.body.reason).toBe('no-video');
    expect(third.body.progress).toMatchObject({
      complete: false,
      hasVideo: false,
      nextLessonId: null,
    });
    expect(accessMap(third.body)).toEqual({
      [l1.id]: 'done',
      [l2.id]: 'done',
      [l3.id]: 'next',
    });

    // Counts on the learner's own endpoints, from the same sequence.
    const mine = await call(student, 'get', '/api/v1/me/levels').expect(200);
    expect(mine.body.levels[0].progress).toMatchObject({
      completed: 2,
      total: 3,
      nextLessonId: l3.id,
      nextLesson: { id: l3.id },
    });
    const access = await call(
      student,
      'get',
      '/api/v1/catalog/levels/prog-seq/access',
    ).expect(200);
    expect(access.body).toMatchObject({
      enrolled: true,
      progress: { completed: 2, total: 3, nextLessonId: l3.id },
    });
    expect(access.body.lessons.map((l: Json) => l.access)).toEqual([
      'done',
      'done',
      'next',
    ]);

    // Completion is sticky: a quiz added later does not undo lesson 1.
    await seedQuiz(l1.id);
    const afterEdit = await call(student, 'get', '/api/v1/me/levels').expect(
      200,
    );
    expect(afterEdit.body.levels[0].progress.completed).toBe(2);
    expect(
      (await playback(student, l1.id).expect(200)).body.progress.complete,
    ).toBe(true);
  });

  it('reports a level in progress on /me/levels and the access endpoint', async () => {
    const levelId = await createLevel('prog-counts');
    const a = await createLesson(levelId, 'A', { video: 60 });
    const b = await createLesson(levelId, 'B', { video: 60 });
    await createLesson(levelId, 'C', { video: 60 });
    await verb('levels', levelId, 'publish');
    const { agent: student, id: studentId } = await signIn(
      'counts@example.com',
      Role.STUDENT,
    );
    await call(student, 'get', '/api/v1/me/levels').expect(200);
    await grant(studentId, levelId);
    await watch(student, studentId, a.id, 0, 54);

    const mine = await call(student, 'get', '/api/v1/me/levels').expect(200);
    expect(mine.body.levels[0].progress).toMatchObject({
      completed: 1,
      total: 3,
      nextLessonId: b.id,
      nextLesson: { id: b.id, number: 2, title: { en: 'B' } },
    });
    expect(
      mine.body.levels[0].progress.lessons.map((l: Json) => l.access),
    ).toEqual(['done', 'next', 'locked']);
    const detail = await call(
      student,
      'get',
      '/api/v1/me/levels/prog-counts',
    ).expect(200);
    expect(detail.body.progress.completed).toBe(1);
    const access = await call(
      student,
      'get',
      '/api/v1/catalog/levels/prog-counts/access',
    ).expect(200);
    expect(access.body.progress).toEqual({
      completed: 1,
      total: 3,
      nextLessonId: b.id,
    });

    // A visitor sees no progress and only preview/locked.
    const visitor = await call(
      undefined,
      'get',
      '/api/v1/catalog/levels/prog-counts/access',
    ).expect(200);
    expect(visitor.body.progress).toBeNull();
    expect(visitor.body.lessons.map((l: Json) => l.access)).toEqual([
      'locked',
      'locked',
      'locked',
    ]);
  });

  it('completes a lesson that has only a quiz when the quiz is passed', async () => {
    const levelId = await createLevel('prog-quiz');
    const a = await createLesson(levelId, 'A');
    const b = await createLesson(levelId, 'B');
    const quiz = await seedQuiz(a.id);
    await verb('levels', levelId, 'publish');
    const { agent: student, id: studentId } = await signIn(
      'quizonly@example.com',
      Role.STUDENT,
    );
    await grant(studentId, levelId);

    expect(
      (await playback(student, a.id).expect(404)).body.progress,
    ).toMatchObject({ complete: false, quizzes: { total: 1, passed: 0 } });
    await playback(student, b.id).expect(403);
    await passQuiz(student, quiz);
    await prisma.lessonProgress.update({
      where: { userId_lessonId: { userId: studentId, lessonId: a.id } },
      data: { completedAt: null },
    });
    await Promise.all([
      reevaluate(studentId, a.id),
      reevaluate(studentId, a.id),
    ]);
    const completedAt = (
      await prisma.lessonProgress.findUniqueOrThrow({
        where: { userId_lessonId: { userId: studentId, lessonId: a.id } },
      })
    ).completedAt;
    expect(completedAt).not.toBeNull();
    await passQuiz(student, quiz);
    expect(
      (
        await prisma.lessonProgress.findUniqueOrThrow({
          where: { userId_lessonId: { userId: studentId, lessonId: a.id } },
        })
      ).completedAt?.getTime(),
    ).toBe(completedAt?.getTime());
    expect(
      (await playback(student, a.id).expect(404)).body.progress.complete,
    ).toBe(true);
    // B has neither, so opening it cannot create progress.
    expect(
      (await playback(student, b.id).expect(404)).body.progress.complete,
    ).toBe(false);
    await opened(student, b.id);
    expect(
      (await playback(student, b.id).expect(404)).body.progress.complete,
    ).toBe(false);
  });

  it('uses the player duration once when the asset has none, and never again', async () => {
    const levelId = await createLevel('prog-duration');
    const a = await createLesson(levelId, 'A', { video: 'unknown' });
    await verb('levels', levelId, 'publish');
    const { agent: student, id: studentId } = await signIn(
      'duration@example.com',
      Role.STUDENT,
    );
    await grant(studentId, levelId);

    // No known length and none reported: a 400, nothing stored.
    await report(student, a.id, {
      segments: [[0, 10]],
      positionSec: 10,
    }).expect(400);
    const first = await report(student, a.id, {
      segments: [[0, 20]],
      positionSec: 20,
      durationSec: 20.4,
    }).expect(200);
    expect(first.body).toMatchObject({ watchedPercent: 100, complete: true });
    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { userId_lessonId: { userId: studentId, lessonId: a.id } },
    });
    expect(row.durationSec).toBe(20);
    // A later, bigger claim cannot stretch the stored duration.
    await report(student, a.id, {
      segments: [[0, 1]],
      positionSec: 1,
      durationSec: 36000,
    }).expect(200);
    expect(
      (
        await prisma.lessonProgress.findUniqueOrThrow({
          where: { userId_lessonId: { userId: studentId, lessonId: a.id } },
        })
      ).durationSec,
    ).toBe(20);
  });

  it('keeps free previews outside the lock, and counts them in the progress', async () => {
    const levelId = await createLevel('prog-preview');
    const a = await createLesson(levelId, 'A', { video: 10 });
    const b = await createLesson(levelId, 'B', { video: 10, preview: true });
    const c = await createLesson(levelId, 'C', { video: 10 });
    await verb('levels', levelId, 'publish');
    const { agent: student, id: studentId } = await signIn(
      'preview@example.com',
      Role.STUDENT,
    );

    // A preview never removes the login requirement; a signed-in visitor's
    // progress is kept without changing the normal sequence.
    await playback(undefined, b.id).expect(401);
    await report(undefined, b.id, { segments: [], positionSec: 0 }).expect(401);
    await playback(student, a.id).expect(200);
    await report(student, b.id, {
      segments: [[0, 5]],
      positionSec: 5,
    }).expect(200);
    await playback(student, a.id).expect(200);

    await grant(studentId, levelId);
    // The preview lesson stays open although lesson A is not done.
    const inMiddle = await playback(student, b.id).expect(200);
    expect(accessMap(inMiddle.body)).toEqual({
      [a.id]: 'next',
      [b.id]: 'preview',
      [c.id]: 'locked',
    });
    expect(inMiddle.body.progress.watchedPercent).toBe(50);
    expect((await playback(student, c.id).expect(403)).body).toMatchObject({
      reason: 'sequence-locked',
      requiredLessonId: a.id,
    });

    // Finishing A unlocks C even while preview lesson B remains unfinished.
    await watch(student, studentId, a.id, 0, 10);
    await watch(student, studentId, c.id, 0, 10);
    const third = await playback(student, c.id).expect(200);
    expect(third.body.progress.complete).toBe(true);
    // Only the unfinished preview is left: it becomes the next lesson.
    expect(accessMap(third.body)).toEqual({
      [a.id]: 'done',
      [b.id]: 'next',
      [c.id]: 'done',
    });

    // Finishing the preview lesson completes the level.
    await age(studentId, b.id, 30);
    const finished = await report(student, b.id, {
      segments: [[5, 10]],
      positionSec: 10,
    }).expect(200);
    expect(finished.body).toMatchObject({ complete: true, nextLessonId: null });
    const mine = await call(student, 'get', '/api/v1/me/levels').expect(200);
    expect(mine.body.levels[0].progress).toMatchObject({
      completed: 3,
      total: 3,
      nextLessonId: null,
    });
  });

  it('lets admins bypass the sequence and keeps public access after revocation', async () => {
    const levelId = await createLevel('prog-admin');
    const a = await createLesson(levelId, 'A', { video: 30 });
    const b = await createLesson(levelId, 'B', { video: 30 });
    await verb('levels', levelId, 'publish');
    const { agent: student, id: studentId } = await signIn(
      'revoked@example.com',
      Role.STUDENT,
    );
    await grant(studentId, levelId);
    await playback(student, b.id).expect(403);

    // Admin: every lesson open, every sibling `open`, reports accepted.
    const asAdmin = await playback(admin, b.id).expect(200);
    expect(accessMap(asAdmin.body)).toEqual({
      [a.id]: 'open',
      [b.id]: 'open',
    });
    await call(admin, 'get', `/api/v1/videos/${b.assetId}/stream`).expect(200);
    await report(admin, b.id, { segments: [[0, 10]], positionSec: 10 }).expect(
      200,
    );

    // Revocation does not remove public access; the lesson sequence still does.
    await call(
      admin,
      'delete',
      `/api/v1/admin/students/${studentId}/enrollments/${levelId}`,
    )
      .send({})
      .expect(204);
    await playback(student, a.id).expect(200);
    await report(student, a.id, { segments: [], positionSec: 0 }).expect(200);
    expect((await playback(student, b.id).expect(403)).body.reason).toBe(
      'sequence-locked',
    );
    expect(
      (
        await report(student, b.id, {
          segments: [],
          positionSec: 0,
        }).expect(403)
      ).body.reason,
    ).toBe('sequence-locked');
    expect(
      (
        await call(student, 'get', `/api/v1/videos/${b.assetId}/stream`).expect(
          403,
        )
      ).body.reason,
    ).toBe('sequence-locked');
  });

  it('keeps progress and the sequence for buyers of an archived level', async () => {
    const levelId = await createLevel('prog-archived');
    const a = await createLesson(levelId, 'A', { video: 30 });
    const b = await createLesson(levelId, 'B', { video: 30 });
    await verb('levels', levelId, 'publish');
    const { agent: student, id: studentId } = await signIn(
      'archived@example.com',
      Role.STUDENT,
    );
    await grant(studentId, levelId);
    await watch(student, studentId, a.id, 0, 27);
    await verb('levels', levelId, 'archive');

    const mine = await call(student, 'get', '/api/v1/me/levels').expect(200);
    expect(mine.body.levels[0]).toMatchObject({
      archived: true,
      progress: { completed: 1, total: 2, nextLessonId: b.id },
    });
    const second = await playback(student, b.id).expect(200);
    expect(accessMap(second.body)).toEqual({ [a.id]: 'done', [b.id]: 'next' });
    expect(second.body.progress.watchedPercent).toBe(0);
  });

  it('answers the progress endpoint matrix: 401, account access, 404, 400', async () => {
    const levelId = await createLevel('prog-matrix');
    const a = await createLesson(levelId, 'A', { video: 30 });
    await verb('levels', levelId, 'publish');
    const hidden = await call(
      admin,
      'post',
      `/api/v1/admin/levels/${levelId}/lessons`,
    )
      .send({ title: { en: 'Hidden' } })
      .expect(201);
    const { agent: student } = await signIn('matrix@example.com', Role.STUDENT);
    const body = { segments: [[0, 5]], positionSec: 5 };

    await report(undefined, a.id, body).expect(401);
    await report(student, a.id, body).expect(200);
    await report(student, hidden.body.id as string, body).expect(404);
    await report(student, randomUUID(), body).expect(404);
    await report(student, 'not-a-uuid', body).expect(400);
    await call(student, 'post', `/api/v1/lessons/${a.id}/progress`)
      .send('nope')
      .expect(400);
  });
});
