import { randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';

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
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface SeededQuiz {
  id: string;
  /** Question ids in order: single (2 pts), multiple (1 pt), true/false (1 pt). */
  questions: { id: string; options: { id: string; isCorrect: boolean }[] }[];
}

const opt = (text: string, isCorrect = false) => ({
  text: { en: text },
  isCorrect,
});

describe('assessment API (e2e)', () => {
  let apiUrl: string;
  let child: ChildProcess;
  let childOutput = '';
  let prisma: PrismaClient;
  let admin: Agent;
  let ipCounter = 0;
  let phoneCounter = 0;

  // The global throttler allows 100 requests a minute per IP, so every call
  // pretends to come from a fresh forwarded address.
  function call(agent: Agent | undefined, method: Method, path: string) {
    ipCounter += 1;
    const target = agent ? agent[method](path) : request(apiUrl)[method](path);
    return target
      .set('Origin', origin)
      .set(
        'X-Forwarded-For',
        `192.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`,
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
        name: 'Assessment User',
        phone: `+2011${String(10_000_000 + phoneCounter)}`,
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

  /** A published level with a free preview, a locked lesson and a draft one. */
  async function seedLevel(slug: string) {
    const levelId = await createLevel(slug);
    const preview = await createLesson(levelId, 'Preview', {
      isFreePreview: true,
    });
    const locked = await createLesson(levelId, 'Locked');
    const hidden = await createLesson(levelId, 'Hidden');
    await verb('lessons', preview, 'publish');
    await verb('lessons', locked, 'publish');
    await verb('levels', levelId, 'publish');
    return { slug, levelId, preview, locked, hidden };
  }

  async function createQuiz(
    lessonId: string,
    extra: Json = {},
  ): Promise<string> {
    const response = await call(
      admin,
      'post',
      `/api/v1/admin/lessons/${lessonId}/quizzes`,
    )
      .send({ title: { en: 'Quiz' }, ...extra })
      .expect(201);
    return response.body.id as string;
  }

  const addQuestion = (quizId: string, body: Json) =>
    call(admin, 'post', `/api/v1/admin/quizzes/${quizId}/questions`).send(body);

  const singleBody = (extra: Json = {}): Json => ({
    type: 'SINGLE',
    prompt: { en: 'Pick the greeting' },
    hanzi: '你好',
    explanation: { en: 'Because it is a greeting' },
    points: 2,
    options: [opt('Hello', true), opt('Goodbye'), opt('Thanks')],
    ...extra,
  });

  const multipleBody = (): Json => ({
    type: 'MULTIPLE',
    prompt: { en: 'Pick all greetings' },
    options: [opt('Hi', true), opt('Bye'), opt('Hello', true), opt('Thanks')],
  });

  const trueFalseBody = (): Json => ({
    type: 'TRUE_FALSE',
    prompt: { en: 'Is 谢谢 thanks?' },
    correctAnswer: true,
  });

  /** A quiz with a SINGLE (2 pts), a MULTIPLE (1 pt) and a TRUE_FALSE (1 pt). */
  async function seedQuiz(
    lessonId: string,
    extra: Json = {},
  ): Promise<SeededQuiz> {
    const id = await createQuiz(lessonId, extra);
    for (const body of [singleBody(), multipleBody(), trueFalseBody()]) {
      await addQuestion(id, body).expect(201);
    }
    return { id, questions: await adminQuestions(id) };
  }

  async function adminQuestions(
    quizId: string,
  ): Promise<SeededQuiz['questions']> {
    const detail = await call(admin, 'get', `/api/v1/admin/quizzes/${quizId}`);
    return (detail.body.questions as Json[]).map((question) => ({
      id: question.id as string,
      options: question.options as { id: string; isCorrect: boolean }[],
    }));
  }

  const correctIds = (question: SeededQuiz['questions'][number]) =>
    question.options.filter((o) => o.isCorrect).map((o) => o.id);
  const wrongIds = (question: SeededQuiz['questions'][number]) =>
    question.options.filter((o) => !o.isCorrect).map((o) => o.id);

  const allCorrect = (quiz: SeededQuiz) => ({
    answers: quiz.questions.map((q) => ({
      questionId: q.id,
      optionIds: correctIds(q),
    })),
  });
  const allWrong = (quiz: SeededQuiz) => ({
    answers: quiz.questions.map((q) => ({
      questionId: q.id,
      optionIds: wrongIds(q).slice(0, 1),
    })),
  });

  const grant = (studentId: string, levelId: string) =>
    call(admin, 'post', `/api/v1/admin/students/${studentId}/enrollments`)
      .send({ levelId })
      .expect(201);

  const attempt = (agent: Agent | undefined, quizId: string, body: Json) =>
    call(agent, 'post', `/api/v1/quizzes/${quizId}/attempts`).send(body);

  async function seedImage(): Promise<string> {
    const row = await prisma.mediaAsset.create({
      data: {
        kind: 'IMAGE',
        storageKey: `${randomUUID()}.webp`,
        mime: 'image/webp',
        sizeBytes: 10,
        width: 40,
        height: 30,
        checksum: randomUUID(),
      },
    });
    return row.id;
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
    await prisma.quizAttempt.deleteMany();
    await prisma.quiz.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.level.deleteMany();
    await prisma.mediaAsset.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  }

  beforeEach(async () => {
    await clean();
    phoneCounter = 0;
    admin = (await signIn('assessment-admin@example.com', Role.ADMIN)).agent;
  });

  afterAll(async () => {
    await clean();
    await prisma?.$disconnect();
    if (child?.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    }
  });

  // ----- admin -------------------------------------------------------------

  it('rejects anonymous callers with 401 and students with 403 on admin routes', async () => {
    const { agent: student } = await signIn(
      'assessment-student@example.com',
      Role.STUDENT,
    );
    const id = '11111111-1111-4111-8111-111111111111';
    const routes: [Method, string][] = [
      ['get', `/api/v1/admin/lessons/${id}/quizzes`],
      ['post', `/api/v1/admin/lessons/${id}/quizzes`],
      ['put', `/api/v1/admin/lessons/${id}/quizzes/order`],
      ['get', `/api/v1/admin/quizzes/${id}`],
      ['patch', `/api/v1/admin/quizzes/${id}`],
      ['post', `/api/v1/admin/quizzes/${id}/archive`],
      ['post', `/api/v1/admin/quizzes/${id}/restore`],
      ['delete', `/api/v1/admin/quizzes/${id}`],
      ['post', `/api/v1/admin/quizzes/${id}/questions`],
      ['put', `/api/v1/admin/quizzes/${id}/questions/order`],
      ['put', `/api/v1/admin/questions/${id}`],
      ['delete', `/api/v1/admin/questions/${id}`],
    ];
    for (const [method, path] of routes) {
      await call(undefined, method, path).send({}).expect(401);
      await call(student, method, path).send({}).expect(403);
    }
  });

  it('creates, lists, reads and updates quizzes with stats', async () => {
    const { locked } = await seedLevel('quiz-crud');
    const created = await call(
      admin,
      'post',
      `/api/v1/admin/lessons/${locked}/quizzes`,
    )
      .send({ title: { en: 'First', ar: 'الأول' } })
      .expect(201)
      .expect('Cache-Control', 'private, no-store');
    expect(created.body).toMatchObject({
      lessonId: locked,
      title: { en: 'First', ar: 'الأول' },
      description: null,
      passingScore: 70,
      sortOrder: 1,
      archivedAt: null,
      questionCount: 0,
      totalPoints: 0,
      attemptCount: 0,
    });

    const second = await seedQuiz(locked, {
      title: { en: 'Second' },
      description: { en: 'About' },
      passingScore: 50,
    });
    const list = await call(
      admin,
      'get',
      `/api/v1/admin/lessons/${locked}/quizzes`,
    ).expect(200);
    expect(list.headers['cache-control']).toBe('private, no-store');
    expect(list.body.quizzes.map((q: Json) => q.sortOrder)).toEqual([1, 2]);
    expect(list.body.quizzes[1]).toMatchObject({
      id: second.id,
      questionCount: 3,
      totalPoints: 4,
      attemptCount: 0,
      passingScore: 50,
    });

    const detail = await call(
      admin,
      'get',
      `/api/v1/admin/quizzes/${second.id}`,
    ).expect(200);
    expect(detail.body.questions).toHaveLength(3);
    expect(detail.body.questions[0]).toMatchObject({
      type: 'SINGLE',
      hanzi: '你好',
      explanation: { en: 'Because it is a greeting' },
      points: 2,
      sortOrder: 1,
      image: null,
    });
    expect(detail.body.questions[0].options[0]).toMatchObject({
      isCorrect: true,
      sortOrder: 1,
    });

    const patched = await call(
      admin,
      'patch',
      `/api/v1/admin/quizzes/${second.id}`,
    )
      .send({ title: { en: 'Renamed' }, description: null, passingScore: 0 })
      .expect(200);
    expect(patched.body).toMatchObject({
      title: { en: 'Renamed' },
      description: null,
      passingScore: 0,
      questionCount: 3,
    });

    // Bad bodies are 400 with zod issues; unknown ids are 404.
    for (const body of [
      { title: { en: 'x' }, passingScore: 101 },
      { title: { en: 'x' }, passingScore: -1 },
      { title: {} },
    ]) {
      const bad = await call(
        admin,
        'post',
        `/api/v1/admin/lessons/${locked}/quizzes`,
      )
        .send(body)
        .expect(400);
      expect(Array.isArray(bad.body.issues)).toBe(true);
    }
    const missing = randomUUID();
    await call(admin, 'get', `/api/v1/admin/quizzes/${missing}`).expect(404);
    await call(admin, 'get', `/api/v1/admin/lessons/${missing}/quizzes`).expect(
      404,
    );
    await call(admin, 'post', `/api/v1/admin/lessons/${missing}/quizzes`)
      .send({ title: { en: 'x' } })
      .expect(404);
    await call(admin, 'get', '/api/v1/admin/quizzes/not-a-uuid').expect(400);
  });

  it('reorders, archives and restores quizzes without breaking the order', async () => {
    const { locked } = await seedLevel('quiz-order');
    const [a, b, c] = [
      await createQuiz(locked, { title: { en: 'A' } }),
      await createQuiz(locked, { title: { en: 'B' } }),
      await createQuiz(locked, { title: { en: 'C' } }),
    ];
    const order = async (): Promise<string[]> =>
      (
        await call(admin, 'get', `/api/v1/admin/lessons/${locked}/quizzes`)
      ).body.quizzes.map((q: Json) => q.id as string);
    const reorder = (ids: string[]) =>
      call(admin, 'put', `/api/v1/admin/lessons/${locked}/quizzes/order`).send({
        ids,
      });

    const reordered = await reorder([c, a, b]).expect(200);
    expect(reordered.body.quizzes.map((q: Json) => q.id)).toEqual([c, a, b]);

    const archived = await call(
      admin,
      'post',
      `/api/v1/admin/quizzes/${a}/archive`,
    ).expect(200);
    expect(typeof archived.body.archivedAt).toBe('string');
    // Archiving twice keeps the first timestamp.
    const again = await call(
      admin,
      'post',
      `/api/v1/admin/quizzes/${a}/archive`,
    ).expect(200);
    expect(again.body.archivedAt).toBe(archived.body.archivedAt);
    expect(await order()).toEqual([c, a, b]); // archived stays listed, flagged

    // The payload must be exactly the non-archived quizzes.
    await reorder([c, a, b]).expect(400);
    await reorder([c]).expect(400);
    await reorder([c, b, b]).expect(400);
    await reorder([c, randomUUID()]).expect(400);
    await reorder([b, c]).expect(200);
    expect(await order()).toEqual([b, a, c]);

    // A new quiz is appended after every slot, archived ones included.
    const d = await createQuiz(locked, { title: { en: 'D' } });
    expect(await order()).toEqual([b, a, c, d]);

    // Restoring brings the quiz back to its own, still free slot.
    const restored = await call(
      admin,
      'post',
      `/api/v1/admin/quizzes/${a}/restore`,
    ).expect(200);
    expect(restored.body.archivedAt).toBeNull();
    expect(await order()).toEqual([b, a, c, d]);
    await reorder([d, c, a, b]).expect(200);
    expect(await order()).toEqual([d, c, a, b]);
    const sortOrders = (
      await call(admin, 'get', `/api/v1/admin/lessons/${locked}/quizzes`)
    ).body.quizzes.map((q: Json) => q.sortOrder as number);
    expect(new Set(sortOrders).size).toBe(4);
  });

  it('deletes a quiz without attempts and answers 409 has-attempts otherwise', async () => {
    const { locked, levelId } = await seedLevel('quiz-delete');
    const plain = await seedQuiz(locked);
    await call(admin, 'delete', `/api/v1/admin/quizzes/${plain.id}`).expect(
      204,
    );
    expect(await prisma.question.count()).toBe(0); // cascade
    await call(admin, 'get', `/api/v1/admin/quizzes/${plain.id}`).expect(404);

    const used = await seedQuiz(locked);
    const { agent, id } = await signIn('deleter@example.com', Role.STUDENT);
    await grant(id, levelId);
    await attempt(agent, used.id, allCorrect(used)).expect(201);
    const conflict = await call(
      admin,
      'delete',
      `/api/v1/admin/quizzes/${used.id}`,
    ).expect(409);
    expect(conflict.body.reason).toBe('has-attempts');
    expect(
      (await call(admin, 'get', `/api/v1/admin/quizzes/${used.id}`)).body
        .attemptCount,
    ).toBe(1);

    // Questions may go even with attempts; their snapshots keep the history.
    await call(
      admin,
      'delete',
      `/api/v1/admin/questions/${used.questions[0]!.id}`,
    ).expect(204);
    await call(
      admin,
      'delete',
      `/api/v1/admin/questions/${used.questions[0]!.id}`,
    ).expect(404);

    // Direct quiz deletion preserves attempt history; archiving is the way out.
    await call(
      admin,
      'post',
      `/api/v1/admin/quizzes/${used.id}/archive`,
    ).expect(200);
  });

  it('validates question rules with 422 invalid-options and 400 for shape errors', async () => {
    const { locked } = await seedLevel('question-rules');
    const quizId = await createQuiz(locked);
    const invalid: [string, Json][] = [
      [
        'single with two correct',
        { type: 'SINGLE', options: [opt('a', true), opt('b', true)] },
      ],
      [
        'single with none correct',
        { type: 'SINGLE', options: [opt('a'), opt('b')] },
      ],
      ['single with one option', { type: 'SINGLE', options: [opt('a', true)] }],
      [
        'single with nine options',
        {
          type: 'SINGLE',
          options: [
            opt('a', true),
            ...Array.from({ length: 8 }, () => opt('x')),
          ],
        },
      ],
      [
        'multiple with none correct',
        { type: 'MULTIPLE', options: [opt('a'), opt('b')] },
      ],
      [
        'multiple with one option',
        { type: 'MULTIPLE', options: [opt('a', true)] },
      ],
      [
        'true/false with three options',
        { type: 'TRUE_FALSE', options: [opt('a', true), opt('b'), opt('c')] },
      ],
      [
        'true/false with both correct',
        { type: 'TRUE_FALSE', options: [opt('a', true), opt('b', true)] },
      ],
      ['true/false without options or correctAnswer', { type: 'TRUE_FALSE' }],
      ['single without options', { type: 'SINGLE' }],
    ];
    for (const [label, extra] of invalid) {
      const response = await addQuestion(quizId, {
        prompt: { en: 'Q' },
        ...extra,
      });
      if (response.status !== 422) {
        throw new Error(`${label}: expected 422, got ${response.status}`);
      }
      expect(response.body).toMatchObject({
        statusCode: 422,
        reason: 'invalid-options',
      });
      expect(typeof response.body.message).toBe('string');
    }
    expect(await prisma.question.count()).toBe(0);

    for (const body of [
      { prompt: { en: 'Q' } }, // no type
      { type: 'ESSAY', prompt: { en: 'Q' } },
      { type: 'SINGLE', prompt: {} },
      { type: 'SINGLE', prompt: { en: 'Q' }, points: 0, options: [] },
      { type: 'SINGLE', prompt: { en: 'Q' }, points: 101, options: [] },
      { type: 'SINGLE', prompt: { en: 'Q' }, hanzi: '你'.repeat(201) },
      { type: 'SINGLE', prompt: { en: 'Q' }, options: [{ text: { en: 'a' } }] },
    ]) {
      const response = await addQuestion(quizId, body).expect(400);
      expect(Array.isArray(response.body.issues)).toBe(true);
    }
    await addQuestion(randomUUID(), singleBody()).expect(404);
  });

  it('creates localized True/False options when a TRUE_FALSE has none', async () => {
    const { locked } = await seedLevel('true-false');
    const quizId = await createQuiz(locked);
    const created = await addQuestion(quizId, {
      type: 'TRUE_FALSE',
      prompt: { en: 'Is it?' },
      correctAnswer: false,
    }).expect(201);
    expect(
      created.body.options.map((o: Json) => [o.text, o.isCorrect, o.sortOrder]),
    ).toEqual([
      [{ en: 'True', ar: 'صح', zh: '对' }, false, 1],
      [{ en: 'False', ar: 'خطأ', zh: '错' }, true, 2],
    ]);
  });

  it('validates image ids, appends and reorders questions, and replaces them', async () => {
    const { locked } = await seedLevel('question-write');
    const quizId = await createQuiz(locked);
    const imageId = await seedImage();

    await addQuestion(quizId, singleBody({ imageId: randomUUID() })).expect(
      422,
    );
    const withImage = await addQuestion(quizId, singleBody({ imageId })).expect(
      201,
    );
    expect(withImage.body.imageId).toBe(imageId);
    expect(withImage.body.image).toMatchObject({
      id: imageId,
      url: expect.stringMatching(/^\/media\/.+\.webp$/),
    });
    const second = await addQuestion(quizId, multipleBody()).expect(201);
    const third = await addQuestion(quizId, trueFalseBody()).expect(201);
    expect([withImage, second, third].map((r) => r.body.sortOrder)).toEqual([
      1, 2, 3,
    ]);

    const detail = await call(admin, 'get', `/api/v1/admin/quizzes/${quizId}`);
    expect(detail.body.questions[0].image).toMatchObject({ id: imageId });

    const ids = [third.body.id, withImage.body.id, second.body.id] as string[];
    const reordered = await call(
      admin,
      'put',
      `/api/v1/admin/quizzes/${quizId}/questions/order`,
    )
      .send({ ids })
      .expect(200);
    expect(reordered.body.questions.map((q: Json) => q.id)).toEqual(ids);
    await call(admin, 'put', `/api/v1/admin/quizzes/${quizId}/questions/order`)
      .send({ ids: ids.slice(1) })
      .expect(400);

    // Replace swaps the question fields and all options at once.
    const replaced = await call(
      admin,
      'put',
      `/api/v1/admin/questions/${withImage.body.id}`,
    )
      .send({
        type: 'MULTIPLE',
        prompt: { en: 'New prompt' },
        points: 5,
        options: [opt('x', true), opt('y', true)],
      })
      .expect(200);
    expect(replaced.body).toMatchObject({
      id: withImage.body.id,
      type: 'MULTIPLE',
      prompt: { en: 'New prompt' },
      hanzi: null,
      imageId: null,
      image: null,
      explanation: null,
      points: 5,
      sortOrder: 2,
    });
    expect(replaced.body.options).toHaveLength(2);
    expect(
      await prisma.option.count({ where: { questionId: replaced.body.id } }),
    ).toBe(2);

    // An invalid replacement leaves the question untouched.
    await call(admin, 'put', `/api/v1/admin/questions/${withImage.body.id}`)
      .send({
        type: 'SINGLE',
        prompt: { en: 'Bad' },
        options: [opt('a'), opt('b')],
      })
      .expect(422);
    expect(
      (
        await prisma.question.findUniqueOrThrow({
          where: { id: withImage.body.id },
        })
      ).type,
    ).toBe('MULTIPLE');
    await call(admin, 'put', `/api/v1/admin/questions/${randomUUID()}`)
      .send(singleBody())
      .expect(404);
  });

  it('keeps past attempt snapshots intact when a question is replaced', async () => {
    const { locked, levelId } = await seedLevel('snapshot-keep');
    const quiz = await seedQuiz(locked);
    const { agent, id } = await signIn('snapshot@example.com', Role.STUDENT);
    await grant(id, levelId);
    const made = await attempt(agent, quiz.id, allCorrect(quiz)).expect(201);
    const before = (
      await call(
        agent,
        'get',
        `/api/v1/attempts/${made.body.attempt.id}`,
      ).expect(200)
    ).body;

    await call(admin, 'put', `/api/v1/admin/questions/${quiz.questions[0]!.id}`)
      .send({
        type: 'SINGLE',
        prompt: { en: 'Changed' },
        points: 9,
        options: [opt('new a'), opt('new b', true)],
      })
      .expect(200);
    await call(
      admin,
      'delete',
      `/api/v1/admin/questions/${quiz.questions[1]!.id}`,
    ).expect(204);

    const after = (
      await call(
        agent,
        'get',
        `/api/v1/attempts/${made.body.attempt.id}`,
      ).expect(200)
    ).body;
    expect(after).toEqual(before);
    expect(after.questions[0].prompt).toEqual({ en: 'Pick the greeting' });
    expect(after.questions).toHaveLength(3);
  });

  // ----- learners ----------------------------------------------------------

  it('applies the content access policy to quiz reads and attempts', async () => {
    const level = await seedLevel('access-matrix');
    const preview = await seedQuiz(level.preview);
    const lockedQuiz = await seedQuiz(level.locked);
    const hiddenQuiz = await seedQuiz(level.hidden);
    const { agent: outsider } = await signIn(
      'outsider@example.com',
      Role.STUDENT,
    );
    const { agent: member, id: memberId } = await signIn(
      'member@example.com',
      Role.STUDENT,
    );
    await grant(memberId, level.levelId);

    // A preview is free after login; anonymous visitors cannot read it.
    await call(
      undefined,
      'get',
      `/api/v1/lessons/${level.preview}/quizzes`,
    ).expect(401);
    await call(undefined, 'get', `/api/v1/quizzes/${preview.id}`).expect(401);
    await attempt(undefined, preview.id, allCorrect(preview)).expect(401);
    await call(
      undefined,
      'get',
      `/api/v1/quizzes/${preview.id}/attempts`,
    ).expect(401);
    await call(undefined, 'get', `/api/v1/attempts/${randomUUID()}`).expect(
      401,
    );

    // Anonymous on a locked lesson: 401 everywhere.
    await call(
      undefined,
      'get',
      `/api/v1/lessons/${level.locked}/quizzes`,
    ).expect(401);
    const locked401 = await call(
      undefined,
      'get',
      `/api/v1/quizzes/${lockedQuiz.id}`,
    ).expect(401);
    expect(locked401.body.reason).toBe('login-required');
    await attempt(undefined, lockedQuiz.id, allCorrect(lockedQuiz)).expect(401);

    // Every signed-in account can read and attempt quizzes on a public level.
    await call(
      outsider,
      'get',
      `/api/v1/lessons/${level.locked}/quizzes`,
    ).expect(200);
    await call(outsider, 'get', `/api/v1/quizzes/${lockedQuiz.id}`).expect(200);
    await attempt(outsider, lockedQuiz.id, allCorrect(lockedQuiz)).expect(201);
    await attempt(outsider, preview.id, allCorrect(preview)).expect(201);

    // Enrolled: full access.
    await call(member, 'get', `/api/v1/lessons/${level.locked}/quizzes`).expect(
      200,
    );
    await call(member, 'get', `/api/v1/quizzes/${lockedQuiz.id}`).expect(200);
    await attempt(member, lockedQuiz.id, allCorrect(lockedQuiz)).expect(201);

    // A draft lesson is a 404 for students, even enrolled ones.
    await call(member, 'get', `/api/v1/lessons/${level.hidden}/quizzes`).expect(
      404,
    );
    await call(member, 'get', `/api/v1/quizzes/${hiddenQuiz.id}`).expect(404);
    await attempt(member, hiddenQuiz.id, allCorrect(hiddenQuiz)).expect(404);
    await call(member, 'get', `/api/v1/lessons/${randomUUID()}/quizzes`).expect(
      404,
    );
    await call(member, 'get', `/api/v1/quizzes/${randomUUID()}`).expect(404);
    // ...but admins see everything.
    await call(admin, 'get', `/api/v1/quizzes/${hiddenQuiz.id}`).expect(200);

    // Revocation does not remove access to a public level, and history remains.
    const made = await attempt(
      member,
      lockedQuiz.id,
      allCorrect(lockedQuiz),
    ).expect(201);
    await call(
      admin,
      'delete',
      `/api/v1/admin/students/${memberId}/enrollments/${level.levelId}`,
    )
      .send({})
      .expect(204);
    await call(member, 'get', `/api/v1/quizzes/${lockedQuiz.id}`).expect(200);
    await attempt(member, lockedQuiz.id, allCorrect(lockedQuiz)).expect(201);
    await call(member, 'get', `/api/v1/lessons/${level.locked}/quizzes`).expect(
      200,
    );
    await call(
      member,
      'get',
      `/api/v1/attempts/${made.body.attempt.id}`,
    ).expect(200);
    const history = await call(
      member,
      'get',
      `/api/v1/quizzes/${lockedQuiz.id}/attempts`,
    ).expect(200);
    expect(history.body.attempts).toHaveLength(3);
  });

  it('hides archived and empty quizzes from students', async () => {
    const level = await seedLevel('archived-quiz');
    const live = await seedQuiz(level.locked, { title: { en: 'Live' } });
    const archived = await seedQuiz(level.locked, {
      title: { en: 'Archived' },
    });
    const empty = await createQuiz(level.locked, { title: { en: 'Empty' } });
    const { agent, id } = await signIn(
      'archive-student@example.com',
      Role.STUDENT,
    );
    await grant(id, level.levelId);
    await call(
      admin,
      'post',
      `/api/v1/admin/quizzes/${archived.id}/archive`,
    ).expect(200);

    const list = await call(
      agent,
      'get',
      `/api/v1/lessons/${level.locked}/quizzes`,
    ).expect(200);
    expect(list.body.quizzes.map((q: Json) => q.id)).toEqual([live.id]);

    await call(agent, 'get', `/api/v1/quizzes/${archived.id}`).expect(404);
    await attempt(agent, archived.id, allCorrect(archived)).expect(404);
    await call(agent, 'get', `/api/v1/quizzes/${empty}`).expect(404);
    await attempt(agent, empty, { answers: [] }).expect(404);
    // Admins may still read an archived quiz.
    await call(admin, 'get', `/api/v1/quizzes/${archived.id}`).expect(200);
  });

  it('never leaks isCorrect or explanations in the quiz-taking payload', async () => {
    const level = await seedLevel('no-leak');
    const { agent: student } = await signIn(
      'no-leak-student@example.com',
      Role.STUDENT,
    );
    const imageId = await seedImage();
    const quizId = await createQuiz(level.preview);
    await addQuestion(quizId, singleBody({ imageId })).expect(201);
    await addQuestion(quizId, multipleBody()).expect(201);
    await addQuestion(quizId, trueFalseBody()).expect(201);

    const response = await call(
      student,
      'get',
      `/api/v1/quizzes/${quizId}`,
    ).expect(200);
    const raw = response.text;
    expect(raw).not.toMatch(/isCorrect|explanation|Because it is a greeting/);
    expect(JSON.stringify(response.body)).not.toMatch(/isCorrect|explanation/);
    expect(response.body).toMatchObject({
      id: quizId,
      lessonId: level.preview,
      passingScore: 70,
      questionCount: 3,
      totalPoints: 4,
    });
    const [first] = response.body.questions as Json[];
    expect(Object.keys(first!).sort()).toEqual(
      ['hanzi', 'id', 'image', 'options', 'points', 'prompt', 'type'].sort(),
    );
    expect(first!.hanzi).toBe('你好');
    expect(first!.image).toMatchObject({ id: imageId });
    expect(first!.options.map((o: Json) => Object.keys(o).sort())).toEqual([
      ['id', 'text'],
      ['id', 'text'],
      ['id', 'text'],
    ]);
    // Options of 3+ choice questions are shuffled, so only the set is fixed.
    expect(first!.options.map((o: Json) => o.text.en).sort()).toEqual([
      'Goodbye',
      'Hello',
      'Thanks',
    ]);
    expect(response.body.questions.map((q: Json) => q.type)).toEqual([
      'SINGLE',
      'MULTIPLE',
      'TRUE_FALSE',
    ]);

    // The list never carries them either.
    const list = await call(
      student,
      'get',
      `/api/v1/lessons/${level.preview}/quizzes`,
    ).expect(200);
    expect(list.text).not.toMatch(/isCorrect|explanation/);
  });

  it('grades attempts end to end and stores a snapshot', async () => {
    const level = await seedLevel('grading');
    const quiz = await seedQuiz(level.locked, { passingScore: 75 });
    const { agent, id } = await signIn('grader@example.com', Role.STUDENT);
    await grant(id, level.levelId);
    const [single, multiple, trueFalse] = quiz.questions as [
      SeededQuiz['questions'][number],
      SeededQuiz['questions'][number],
      SeededQuiz['questions'][number],
    ];

    // Multiple partial (one of two right options) loses that question: 3/4 = 75 -> passed.
    const partial = await attempt(agent, quiz.id, {
      answers: [
        { questionId: single.id, optionIds: correctIds(single) },
        {
          questionId: multiple.id,
          optionIds: correctIds(multiple).slice(0, 1),
        },
        { questionId: trueFalse.id, optionIds: correctIds(trueFalse) },
      ],
    }).expect(201);
    expect(partial.body.attempt).toMatchObject({
      score: 75,
      earnedPoints: 3,
      totalPoints: 4,
      passed: true,
    });
    expect(partial.body.results).toEqual([
      expect.objectContaining({ questionId: single.id, correct: true }),
      expect.objectContaining({
        questionId: multiple.id,
        correct: false,
        chosen: correctIds(multiple).slice(0, 1),
        correctOptionIds: correctIds(multiple),
        explanation: null,
      }),
      expect.objectContaining({ questionId: trueFalse.id, correct: true }),
    ]);
    expect(partial.body.results[0].explanation).toEqual({
      en: 'Because it is a greeting',
    });

    // A superset of the correct options is wrong too; the single is wrong; 1/4 = 25.
    const superset = await attempt(agent, quiz.id, {
      answers: [
        { questionId: single.id, optionIds: wrongIds(single).slice(0, 1) },
        {
          questionId: multiple.id,
          optionIds: multiple.options.map((o) => o.id),
        },
        { questionId: trueFalse.id, optionIds: correctIds(trueFalse) },
      ],
    }).expect(201);
    expect(superset.body.attempt).toMatchObject({ score: 25, passed: false });
    for (const result of superset.body.results as Json[]) {
      expect(result).not.toHaveProperty('correctOptionIds');
      expect(result).not.toHaveProperty('explanation');
    }
    const failedReview = await call(
      agent,
      'get',
      `/api/v1/attempts/${superset.body.attempt.id}`,
    ).expect(200);
    expect(failedReview.body.questions[0]).not.toHaveProperty('explanation');
    expect(failedReview.body.questions[0].options[0]).not.toHaveProperty(
      'isCorrect',
    );
    expect(failedReview.body.questions[0]).toHaveProperty('chosen');
    expect(failedReview.body.questions[0]).toHaveProperty('correct');

    const perfect = await attempt(agent, quiz.id, allCorrect(quiz)).expect(201);
    expect(perfect.body.attempt).toMatchObject({ score: 100, passed: true });
    expect(perfect.body.results[0]).toHaveProperty('correctOptionIds');
    expect(perfect.body.results[0]).toHaveProperty('explanation');
    const zero = await attempt(agent, quiz.id, allWrong(quiz)).expect(201);
    expect(zero.body.attempt).toMatchObject({
      score: 0,
      earnedPoints: 0,
      passed: false,
    });

    // The stored snapshot is the documented version-1 shape.
    const row = await prisma.quizAttempt.findUniqueOrThrow({
      where: { id: partial.body.attempt.id },
    });
    const snapshot = row.snapshot as Json;
    expect(snapshot.version).toBe(1);
    expect(snapshot.passingScore).toBe(75);
    expect(snapshot.questions).toHaveLength(3);
    expect(snapshot.questions[1]).toMatchObject({
      id: multiple.id,
      type: 'MULTIPLE',
      prompt: { en: 'Pick all greetings' },
      points: 1,
      correct: false,
      chosen: correctIds(multiple).slice(0, 1),
    });
    expect(snapshot.questions[1].options).toHaveLength(4);
    expect(snapshot.questions[1].options[0]).toEqual({
      id: multiple.options[0]!.id,
      text: { en: 'Hi' },
      isCorrect: true,
    });

    // List: best score and attempt count (best = highest score, then newest).
    const list = await call(
      agent,
      'get',
      `/api/v1/lessons/${level.locked}/quizzes`,
    ).expect(200);
    expect(list.body.quizzes[0]).toMatchObject({
      id: quiz.id,
      attempts: 4,
      best: { score: 100, passed: true },
    });

    // History: newest first, summaries only.
    const history = await call(
      agent,
      'get',
      `/api/v1/quizzes/${quiz.id}/attempts`,
    ).expect(200);
    expect(history.headers['cache-control']).toBe('private, no-store');
    expect(history.body.attempts.map((a: Json) => a.id)).toEqual([
      zero.body.attempt.id,
      perfect.body.attempt.id,
      superset.body.attempt.id,
      partial.body.attempt.id,
    ]);
    expect(Object.keys(history.body.attempts[0]).sort()).toEqual(
      [
        'createdAt',
        'earnedPoints',
        'id',
        'passed',
        'score',
        'totalPoints',
      ].sort(),
    );
    const admin1 = await call(
      admin,
      'get',
      `/api/v1/admin/quizzes/${quiz.id}`,
    ).expect(200);
    expect(admin1.body.attemptCount).toBe(4);
  });

  it('rejects malformed attempt payloads with 400', async () => {
    const level = await seedLevel('bad-payloads');
    const quiz = await seedQuiz(level.locked);
    const other = await seedQuiz(level.locked);
    const { agent, id } = await signIn('bad@example.com', Role.STUDENT);
    await grant(id, level.levelId);
    const [single, multiple, trueFalse] = quiz.questions as [
      SeededQuiz['questions'][number],
      SeededQuiz['questions'][number],
      SeededQuiz['questions'][number],
    ];
    const good = allCorrect(quiz).answers;

    const bad: [string, Json][] = [
      ['no body', {}],
      ['not an array', { answers: 'x' }],
      ['missing a question', { answers: good.slice(1) }],
      ['no answers', { answers: [] }],
      [
        'unknown question',
        { answers: [...good, { questionId: randomUUID(), optionIds: [] }] },
      ],
      ['duplicate question', { answers: [...good, good[0]] }],
      [
        'option of another question',
        {
          answers: [
            { questionId: single.id, optionIds: [multiple.options[0]!.id] },
            ...good.slice(1),
          ],
        },
      ],
      [
        'option of another quiz',
        {
          answers: [
            {
              questionId: single.id,
              optionIds: [other.questions[0]!.options[0]!.id],
            },
            ...good.slice(1),
          ],
        },
      ],
      [
        'duplicate option',
        {
          answers: [
            good[0],
            {
              questionId: multiple.id,
              optionIds: [multiple.options[0]!.id, multiple.options[0]!.id],
            },
            good[2],
          ],
        },
      ],
      [
        'two options on a single',
        {
          answers: [
            {
              questionId: single.id,
              optionIds: single.options.slice(0, 2).map((o) => o.id),
            },
            ...good.slice(1),
          ],
        },
      ],
      [
        'no option on a single',
        {
          answers: [{ questionId: single.id, optionIds: [] }, ...good.slice(1)],
        },
      ],
      [
        'no option on a multiple',
        {
          answers: [
            good[0],
            { questionId: multiple.id, optionIds: [] },
            good[2],
          ],
        },
      ],
      [
        'two options on a true/false',
        {
          answers: [
            good[0],
            good[1],
            {
              questionId: trueFalse.id,
              optionIds: trueFalse.options.map((o) => o.id),
            },
          ],
        },
      ],
      ['non-uuid ids', { answers: [{ questionId: 'x', optionIds: ['y'] }] }],
    ];
    // Rejected submissions count toward the 10 a minute limit, so the table
    // is spread over several learners.
    const learners: Agent[] = [agent];
    for (const [index, [label, body]] of bad.entries()) {
      if (index % 8 === 0 && index > 0) {
        const next = await signIn(`bad-${index}@example.com`, Role.STUDENT);
        await grant(next.id, level.levelId);
        learners.push(next.agent);
      }
      const response = await attempt(learners.at(-1), quiz.id, body);
      if (response.status !== 400) {
        throw new Error(`${label}: expected 400, got ${response.status}`);
      }
    }
    const detailed = await attempt(learners.at(-1), quiz.id, {
      answers: good.slice(1),
    }).expect(400);
    expect(detailed.body.issues).toEqual([
      { questionId: single.id, message: 'Question not answered' },
    ]);
    expect(await prisma.quizAttempt.count()).toBe(0);
  });

  it('keeps attempts private to their owner, readable by admins and after edits', async () => {
    const level = await seedLevel('visibility');
    const quiz = await seedQuiz(level.locked);
    const { agent: owner, id: ownerId } = await signIn(
      'owner@example.com',
      Role.STUDENT,
    );
    const { agent: other, id: otherId } = await signIn(
      'other@example.com',
      Role.STUDENT,
    );
    await grant(ownerId, level.levelId);
    await grant(otherId, level.levelId);
    const made = await attempt(owner, quiz.id, allCorrect(quiz)).expect(201);
    const attemptId = made.body.attempt.id as string;

    const own = await call(owner, 'get', `/api/v1/attempts/${attemptId}`)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(own.body.attempt).toMatchObject({
      id: attemptId,
      quizId: quiz.id,
      score: 100,
      passed: true,
      passingScore: 70,
    });
    expect(own.body.questions).toHaveLength(3);
    expect(own.body.questions[0]).toMatchObject({
      correct: true,
      points: 2,
      explanation: { en: 'Because it is a greeting' },
    });
    expect(own.body.questions[0].options[0]).toHaveProperty('isCorrect', true);

    await call(other, 'get', `/api/v1/attempts/${attemptId}`).expect(404);
    await call(admin, 'get', `/api/v1/attempts/${attemptId}`).expect(200);
    await call(owner, 'get', `/api/v1/attempts/${randomUUID()}`).expect(404);
    // The other learner's history on the same quiz is empty.
    const theirs = await call(
      other,
      'get',
      `/api/v1/quizzes/${quiz.id}/attempts`,
    ).expect(200);
    expect(theirs.body.attempts).toEqual([]);
    await call(other, 'get', `/api/v1/quizzes/${randomUUID()}/attempts`).expect(
      404,
    );

    // Archiving the quiz or the lesson does not hide the learner's own result.
    await call(
      admin,
      'post',
      `/api/v1/admin/quizzes/${quiz.id}/archive`,
    ).expect(200);
    await verb('lessons', level.locked, 'unpublish');
    const archivedRead = await call(
      owner,
      'get',
      `/api/v1/attempts/${attemptId}`,
    ).expect(200);
    expect(archivedRead.body).toEqual(own.body);
  });

  it('throttles quiz attempts to 10 a minute per learner', async () => {
    const level = await seedLevel('throttle');
    const quiz = await seedQuiz(level.locked);
    const { agent, id } = await signIn('throttled@example.com', Role.STUDENT);
    const { agent: calm, id: calmId } = await signIn(
      'calm@example.com',
      Role.STUDENT,
    );
    await grant(id, level.levelId);
    await grant(calmId, level.levelId);

    for (let index = 0; index < 10; index += 1) {
      await attempt(agent, quiz.id, allCorrect(quiz)).expect(201);
    }
    // Every call comes from a fresh IP, so this limit is per learner.
    await attempt(agent, quiz.id, allCorrect(quiz)).expect(429);
    expect(await prisma.quizAttempt.count({ where: { userId: id } })).toBe(10);
    // Another learner is unaffected.
    await attempt(calm, quiz.id, allCorrect(quiz)).expect(201);
  });
});
