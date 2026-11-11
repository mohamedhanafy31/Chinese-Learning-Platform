import { fork, type ChildProcess } from 'node:child_process';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { Role } from '@app/shared';

import { computeHmac } from '../src/billing/paymob/paymob-hmac';
import {
  OrderStatus,
  PrismaClient,
  WebhookProvider,
} from '../src/generated/prisma/client';

const origin = 'http://localhost:3000';
const password = 'initial-password';
const secretKey = 'mock-paymob-secret-key';
const publicKey = 'mock-paymob-public-key';
const hmacSecret = 'mock-paymob-hmac-secret';
const integrationId = 4242;

type Agent = ReturnType<typeof request.agent>;
type Method = 'get' | 'post' | 'patch';
type Json = Record<string, unknown>;

interface RecordedRequest {
  headers: IncomingMessage['headers'];
  body: Json;
}

class MockPaymob {
  requests: RecordedRequest[] = [];
  fail = false;
  delayMs = 0;
  private sequence = 7000;
  private server: Server | null = null;
  baseUrl = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Json;
        this.requests.push({ headers: req.headers, body });
        const respond = () => this.respond(req, res);
        if (this.delayMs > 0) setTimeout(respond, this.delayMs);
        else respond();
      });
    });
    await new Promise<void>((resolve) =>
      this.server?.listen(0, '127.0.0.1', resolve),
    );
    const address = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${address.port}`;
  }

  reset(): void {
    this.requests = [];
    this.fail = false;
    this.delayMs = 0;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      this.server.closeAllConnections();
    });
  }

  private respond(req: IncomingMessage, res: ServerResponse): void {
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST' || req.url !== '/v1/intention/') {
      res.statusCode = 404;
      res.end('{}');
      return;
    }
    if (this.fail) {
      res.statusCode = 500;
      res.end('{"message":"provider failed"}');
      return;
    }
    this.sequence += 1;
    res.end(
      JSON.stringify({
        id: `intention-${this.sequence}`,
        client_secret: `client-${this.sequence}`,
        intention_order_id: this.sequence,
        extra_field: true,
      }),
    );
  }
}

interface TestApi {
  url: string;
  child: ChildProcess;
  output: () => string;
  expire: (now: Date) => Promise<Json>;
  stop: () => Promise<void>;
}

async function bootServer(
  env: Record<string, string | undefined>,
): Promise<TestApi> {
  let output = '';
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    BILLING_EXPIRY_INTERVAL_SEC: '0',
    ...env,
  };
  for (const [key, value] of Object.entries(childEnv)) {
    if (value === undefined) delete childEnv[key];
  }
  const child = fork('test/test-server.ts', {
    cwd: process.cwd(),
    execArgv: ['--import', 'tsx'],
    env: childEnv,
    silent: true,
  });
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Test API timed out. Output:\n${output}`)),
      20_000,
    );
    child.on('message', (message: { type?: string; port?: number }) => {
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
    expire: (now) =>
      new Promise<Json>((resolve, reject) => {
        const requestId = randomUUID();
        const listener = (message: {
          requestId?: string;
          type?: string;
          result?: Json;
          error?: string;
        }) => {
          if (message.requestId !== requestId) return;
          child.off('message', listener);
          if (message.type === 'error') reject(new Error(message.error));
          else resolve(message.result ?? {});
        };
        child.on('message', listener);
        child.send({
          type: 'billing:expire',
          requestId,
          now: now.toISOString(),
        });
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

describe('billing API (e2e)', () => {
  const mock = new MockPaymob();
  let api: TestApi;
  let plain: TestApi;
  let prisma: PrismaClient;
  let admin: Agent;
  let student: Agent;
  let other: Agent;
  let ipCounter = 0;
  let phoneCounter = 0;

  function call(
    agent: Agent | undefined,
    method: Method,
    path: string,
    base = api.url,
  ) {
    ipCounter += 1;
    const target = agent ? agent[method](path) : request(base)[method](path);
    return target
      .set('Origin', origin)
      .set(
        'X-Forwarded-For',
        `198.54.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`,
      );
  }

  async function signIn(
    email: string,
    role: Role,
    base = api.url,
  ): Promise<{ agent: Agent; id: string }> {
    const agent = request.agent(base);
    phoneCounter += 1;
    await call(agent, 'post', '/api/v1/auth/register', base)
      .send({
        email,
        password,
        name: email.startsWith('single') ? 'Hanafy' : 'Billing Student',
        phone: `+2010${String(4_000_000 + phoneCounter)}`,
      })
      .expect(201);
    const user = await prisma.user.update({ where: { email }, data: { role } });
    await call(agent, 'post', '/api/v1/auth/login', base)
      .send({ email, password })
      .expect(200);
    return { agent, id: user.id };
  }

  async function createLevel(
    slug: string,
    priceMinor: number | null = 125000,
    publish = true,
  ): Promise<string> {
    const response = await call(admin, 'post', '/api/v1/admin/levels')
      .send({
        slug,
        hanzi: '付款',
        title: { en: `Level ${slug}`, ar: `مستوى ${slug}` },
        summary: { en: 'Summary' },
        priceMinor,
      })
      .expect(201);
    const id = (response.body as Json).id as string;
    if (publish) {
      await call(admin, 'post', `/api/v1/admin/levels/${id}/publish`).expect(
        200,
      );
    }
    return id;
  }

  function checkout(levelId: string, agent = student) {
    return call(agent, 'post', '/api/v1/billing/checkout').send({
      levelId,
      locale: 'en',
    });
  }

  async function orderFor(levelId: string, userId?: string) {
    return prisma.order.findFirstOrThrow({
      where: { levelId, ...(userId ? { userId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  function transactionObject(
    order: Awaited<ReturnType<typeof orderFor>>,
    extra: Json = {},
  ): Json {
    return {
      amount_cents: order.amountMinor,
      created_at: new Date().toISOString(),
      currency: order.currency,
      error_occured: false,
      has_parent_transaction: false,
      id: `tx-${randomUUID()}`,
      integration_id: integrationId,
      is_3d_secure: true,
      is_auth: false,
      is_capture: true,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: {
        id: order.paymobOrderId,
        merchant_order_id: order.specialReference,
      },
      owner: 99,
      pending: false,
      source_data: {
        pan: 'xxxx-xxxx-xxxx-2346',
        sub_type: 'MasterCard',
        type: 'card',
      },
      success: true,
      billing_data: {
        email: 'must-not-be-stored@example.com',
        phone_number: '+201001111111',
      },
      data: { message: 'Approved' },
      ...extra,
    };
  }

  function webhook(object: Json, hmac = computeHmac(object, hmacSecret)) {
    ipCounter += 1;
    return request(api.url)
      .post(`/api/v1/webhooks/paymob?hmac=${hmac}`)
      .set('Content-Type', 'application/json')
      .set('X-Forwarded-For', `198.55.0.${(ipCounter % 250) + 1}`)
      .send({ type: 'TRANSACTION', obj: object });
  }

  async function clean(): Promise<void> {
    await prisma.paymentTransaction.deleteMany();
    await prisma.webhookEvent.deleteMany({
      where: { provider: WebhookProvider.PAYMOB },
    });
    await prisma.enrollment.deleteMany();
    await prisma.order.deleteMany();
    await prisma.quizAttempt.deleteMany();
    await prisma.option.deleteMany();
    await prisma.question.deleteMany();
    await prisma.quiz.deleteMany();
    await prisma.lesson.updateMany({ data: { activeVideoId: null } });
    await prisma.videoAsset.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.level.deleteMany();
    await prisma.mediaAsset.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  }

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    await mock.start();
    api = await bootServer({
      PAYMOB_SECRET_KEY: secretKey,
      PAYMOB_PUBLIC_KEY: publicKey,
      PAYMOB_HMAC_SECRET: hmacSecret,
      PAYMOB_INTEGRATION_IDS: String(integrationId),
      PAYMOB_API_BASE: mock.baseUrl,
      PAYMOB_CHECKOUT_BASE: 'https://eg.checkout.paymob.com/',
      API_PUBLIC_ORIGIN: 'https://api.example.test',
    });
    plain = await bootServer({
      PAYMOB_SECRET_KEY: undefined,
      PAYMOB_PUBLIC_KEY: undefined,
      PAYMOB_HMAC_SECRET: undefined,
      PAYMOB_INTEGRATION_IDS: undefined,
      PAYMOB_API_BASE: mock.baseUrl,
    });
  });

  beforeEach(async () => {
    await clean();
    mock.reset();
    admin = (await signIn('billing-admin@example.com', Role.ADMIN)).agent;
    student = (await signIn('billing-student@example.com', Role.STUDENT)).agent;
    other = (await signIn('billing-other@example.com', Role.STUDENT)).agent;
  });

  afterAll(async () => {
    await clean().catch(() => undefined);
    await prisma?.$disconnect();
    await api?.stop();
    await plain?.stop();
    await mock.stop();
  });

  it('creates an intention with piaster amounts, card ids and exact callback URLs', async () => {
    const levelId = await createLevel('billing-create');
    const response = await checkout(levelId).expect(201);
    expect(response.body).toMatchObject({
      orderId: expect.any(String),
      checkoutUrl: expect.stringContaining('clientSecret='),
    });
    expect(mock.requests).toHaveLength(1);
    const recorded = mock.requests[0] as RecordedRequest;
    expect(recorded.headers.authorization).toBe(`Token ${secretKey}`);
    expect(recorded.body).toMatchObject({
      amount: 125000,
      currency: 'EGP',
      payment_methods: [integrationId],
      items: [{ amount: 125000, quantity: 1 }],
      notification_url: 'https://api.example.test/api/v1/webhooks/paymob',
    });
    expect(recorded.body.redirection_url).toMatch(
      /^http:\/\/localhost:3000\/en\/checkout\/result\?order=/,
    );
    expect(recorded.body.special_reference).toMatch(/^[0-9a-f-]{36}$/);
    expect((recorded.body.billing_data as Json).phone_number).toMatch(/^\+20/);
  });

  it('reports payment availability without requiring a session', async () => {
    await request(api.url)
      .get('/api/v1/billing/availability')
      .expect(200)
      .expect({ available: true });
    await request(plain.url)
      .get('/api/v1/billing/availability')
      .expect(200)
      .expect({ available: false });
  });

  it('reuses an existing checkout and parallel calls create one intention', async () => {
    const levelId = await createLevel('billing-reuse');
    mock.delayMs = 150;
    const [first, second] = await Promise.all([
      checkout(levelId).expect(201),
      checkout(levelId).expect(201),
    ]);
    expect(first.body).toEqual(second.body);
    expect(mock.requests).toHaveLength(1);
    await checkout(levelId).expect(201).expect(first.body);
    expect(mock.requests).toHaveLength(1);
    expect(await prisma.order.count({ where: { levelId } })).toBe(1);
  });

  it('cancels the old pending order after a price change', async () => {
    const levelId = await createLevel('billing-price');
    await checkout(levelId).expect(201);
    await call(admin, 'patch', `/api/v1/admin/levels/${levelId}`)
      .send({ priceMinor: 130000 })
      .expect(200);
    await checkout(levelId).expect(201);
    const orders = await prisma.order.findMany({
      where: { levelId },
      orderBy: { createdAt: 'asc' },
    });
    expect(orders.map((order) => [order.amountMinor, order.status])).toEqual([
      [125000, OrderStatus.CANCELED],
      [130000, OrderStatus.PENDING],
    ]);
    expect(mock.requests).toHaveLength(2);

    // The learner still pays on the old, already-canceled checkout page: the
    // verified payment of that order's own amount must enroll them.
    await webhook(transactionObject(orders[0]!))
      .expect(200)
      .expect({ status: 'applied' });
    const paid = await prisma.order.findUniqueOrThrow({
      where: { id: orders[0]!.id },
    });
    expect(paid.status).toBe(OrderStatus.PAID);
    expect(
      await prisma.enrollment.findFirst({
        where: { levelId, orderId: paid.id, revokedAt: null },
      }),
    ).not.toBeNull();
  });

  it('rejects not-for-sale, unpublished and already-enrolled levels', async () => {
    const free = await createLevel('billing-free', 0);
    const unpriced = await createLevel('billing-unpriced', null);
    const unpublished = await createLevel('billing-hidden', 1000, false);
    for (const id of [free, unpriced, unpublished]) {
      await checkout(id).expect(409).expect({ reason: 'not-for-sale' });
    }
    const enrolled = await createLevel('billing-owned');
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'billing-student@example.com' },
    });
    await prisma.enrollment.create({
      data: { userId: user.id, levelId: enrolled, source: 'ADMIN' },
    });
    await checkout(enrolled).expect(409).expect({ reason: 'already-enrolled' });
    expect(mock.requests).toHaveLength(0);
  });

  it('returns unavailable when unconfigured and cancels on provider 500', async () => {
    const levelId = await createLevel('billing-errors');
    const plainStudent = (
      await signIn('plain-student@example.com', Role.STUDENT, plain.url)
    ).agent;
    await call(plainStudent, 'post', '/api/v1/billing/checkout', plain.url)
      .send({ levelId })
      .expect(503)
      .expect({ reason: 'payments-unavailable' });
    mock.fail = true;
    await checkout(levelId).expect(502).expect({ reason: 'provider-error' });
    expect((await orderFor(levelId)).status).toBe(OrderStatus.CANCELED);
  });

  it('pays once, grants PURCHASE access, redacts PII and dedupes callbacks', async () => {
    const levelId = await createLevel('billing-paid');
    await checkout(levelId).expect(201);
    const order = await orderFor(levelId);
    const object = transactionObject(order);
    await webhook(object).expect(200).expect({ status: 'applied' });
    await webhook(object).expect(200).expect({ status: 'duplicate' });
    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updated.status).toBe(OrderStatus.PAID);
    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: { levelId },
    });
    expect(enrollment).toMatchObject({
      source: 'PURCHASE',
      orderId: order.id,
      revokedAt: null,
    });
    await call(student, 'get', '/api/v1/me/levels')
      .expect(200)
      .expect((response) => {
        expect((response.body as { levels: unknown[] }).levels).toHaveLength(1);
      });
    const stored = await prisma.paymentTransaction.findFirstOrThrow({
      where: { orderId: order.id },
    });
    const serialized = JSON.stringify(stored.payloadRedacted);
    expect(serialized).not.toContain('must-not-be-stored@example.com');
    expect(serialized).not.toContain('+201001111111');
    expect(
      await prisma.paymentTransaction.count({ where: { orderId: order.id } }),
    ).toBe(1);
  });

  it('rejects a bad HMAC without writing anything', async () => {
    const levelId = await createLevel('billing-hmac');
    await checkout(levelId).expect(201);
    await webhook(transactionObject(await orderFor(levelId)), '00').expect(401);
    expect(await prisma.paymentTransaction.count()).toBe(0);
    expect(
      await prisma.webhookEvent.count({ where: { provider: 'PAYMOB' } }),
    ).toBe(0);
  });

  it.each([
    ['amount', { amount_cents: 1 }],
    ['currency', { currency: 'USD' }],
    ['integration', { integration_id: 9999 }],
  ])('records a %s mismatch without paying', async (_name, extra) => {
    const levelId = await createLevel(`billing-mismatch-${_name}`);
    await checkout(levelId).expect(201);
    const order = await orderFor(levelId);
    await webhook(transactionObject(order, extra))
      .expect(200)
      .expect({ status: 'recorded-mismatch' });
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe('PENDING');
    expect(
      await prisma.paymentTransaction.count({ where: { orderId: order.id } }),
    ).toBe(1);
  });

  it('keeps failed and pending attempts pending, then accepts a later success', async () => {
    const levelId = await createLevel('billing-retry');
    await checkout(levelId).expect(201);
    const order = await orderFor(levelId);
    await webhook(transactionObject(order, { success: false })).expect(200);
    await webhook(transactionObject(order, { pending: true })).expect(200);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe('PENDING');
    await webhook(transactionObject(order)).expect(200);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe('PAID');
    expect(
      await prisma.paymentTransaction.count({ where: { orderId: order.id } }),
    ).toBe(3);
  });

  it('pays an expired order late and re-grants a revoked enrollment', async () => {
    const levelId = await createLevel('billing-late');
    await checkout(levelId).expect(201);
    const order = await orderFor(levelId);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'billing-student@example.com' },
    });
    await prisma.enrollment.create({
      data: {
        userId: user.id,
        levelId,
        source: 'ADMIN',
        revokedAt: new Date(),
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'EXPIRED' },
    });
    await webhook(transactionObject(order)).expect(200);
    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: { levelId },
    });
    expect(enrollment).toMatchObject({
      revokedAt: null,
      source: 'PURCHASE',
      orderId: order.id,
    });
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe('PAID');
  });

  it('records a refund, marks REFUNDED and keeps enrollment active', async () => {
    const levelId = await createLevel('billing-refund');
    await checkout(levelId).expect(201);
    const order = await orderFor(levelId);
    await webhook(transactionObject(order)).expect(200);
    await webhook(transactionObject(order, { is_refunded: true })).expect(200);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe('REFUNDED');
    expect(
      (await prisma.enrollment.findFirstOrThrow({ where: { levelId } }))
        .revokedAt,
    ).toBeNull();
  });

  it('ignores unknown orders and non-transaction events', async () => {
    const levelId = await createLevel('billing-unknown');
    await checkout(levelId).expect(201);
    const order = await orderFor(levelId);
    const unknown = transactionObject(order, {
      order: { id: 'other', merchant_order_id: randomUUID() },
    });
    await webhook(unknown).expect(200).expect({ status: 'ignored' });
    await request(api.url)
      .post('/api/v1/webhooks/paymob')
      .send({ type: 'TOKEN', obj: {} })
      .expect(200)
      .expect({ status: 'ignored' });
    expect(await prisma.paymentTransaction.count()).toBe(0);
  });

  it('enforces owner reads and gives admins filtered order views', async () => {
    const levelId = await createLevel('billing-reads');
    const created = await checkout(levelId).expect(201);
    const orderId = (created.body as Json).orderId as string;
    await call(student, 'get', `/api/v1/billing/orders/${orderId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).not.toHaveProperty('clientSecret');
        expect(response.body).not.toHaveProperty('checkoutUrl');
      });
    await call(other, 'get', `/api/v1/billing/orders/${orderId}`).expect(404);
    await call(admin, 'get', `/api/v1/billing/orders/${orderId}`).expect(200);
    await call(student, 'get', '/api/v1/billing/orders')
      .expect(200)
      .expect((response) => {
        expect((response.body as { orders: unknown[] }).orders).toHaveLength(1);
      });
    await call(
      admin,
      'get',
      '/api/v1/admin/orders?status=PENDING&q=billing-student&page=1',
    )
      .expect(200)
      .expect((response) => {
        expect((response.body as { total: number }).total).toBe(1);
      });
    await call(admin, 'get', `/api/v1/admin/orders/${orderId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).not.toHaveProperty('clientSecret');
        expect(response.body).toHaveProperty('transactions');
      });
  });

  it('expires pending orders and reports mismatches, unknown callbacks and missing enrollments', async () => {
    const levelId = await createLevel('billing-report');
    await checkout(levelId).expect(201);
    const order = await orderFor(levelId);
    await prisma.order.update({
      where: { id: order.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect(await api.expire(new Date())).toEqual({ expired: 1 });
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe('EXPIRED');
    await webhook(transactionObject(order, { amount_cents: 1 })).expect(200);
    await webhook(
      transactionObject(order, {
        order: { id: 'unknown', merchant_order_id: randomUUID() },
      }),
    ).expect(200);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await call(admin, 'get', '/api/v1/admin/billing/report')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          callbacksWithMismatches: 1,
          callbacksWithoutMatchingOrder: 1,
          paidOrdersWithoutEnrollment: 1,
        });
      });
  });
});
