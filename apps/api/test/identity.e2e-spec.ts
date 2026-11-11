import { createHash, createHmac, randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';

import { PrismaPg } from '@prisma/adapter-pg';
import request, { type Response } from 'supertest';
import { Role } from '@app/shared';

import { PrismaClient } from '../src/generated/prisma/client';

const origin = 'http://localhost:3000';
const refreshPepper = 'test-only-refresh-secret-at-least-thirty-two-characters';
const validRegistration = {
  email: 'student@example.com',
  password: 'initial-password',
  name: 'Student User',
  phone: '+20 100-123-4567',
};

interface MailEntry {
  locale: string;
  resetLink: string;
  to: string;
  userId: string;
}

interface IpcResponse {
  error?: string;
  outbox?: MailEntry[];
  port?: number;
  requestId?: string;
  type: string;
}

function cookies(response: Response): string[] {
  const value = response.headers['set-cookie'];
  if (Array.isArray(value)) return value;
  return typeof value === 'string' ? [value] : [];
}

function cookiePair(response: Response, name: string): string {
  const matching = cookies(response).find((cookie) =>
    cookie.startsWith(`${name}=`),
  );
  if (!matching) throw new Error(`Response did not set ${name}`);
  return matching.split(';', 1)[0] as string;
}

function extractResetToken(link: string): string {
  const token = new URL(link).searchParams.get('token');
  if (!token) throw new Error('Reset link did not contain a token');
  return token;
}

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashRefreshToken(token: string): string {
  return createHmac('sha256', refreshPepper).update(token).digest('hex');
}

describe('identity API (e2e)', () => {
  let apiUrl: string;
  let child: ChildProcess;
  let childOutput = '';
  let prisma: PrismaClient;

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
    const ready = await waitForMessage((message) => message.type === 'ready');
    if (!ready.port) {
      throw new Error(
        `Test API did not report a port. Output:\n${childOutput}`,
      );
    }
    apiUrl = `http://127.0.0.1:${ready.port}`;
  });

  beforeEach(async () => {
    await sendCommand({ type: 'clock:reset' });
    await sendCommand({ type: 'mail:clear' });
    await prisma.passwordReset.deleteMany();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (child?.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    }
  });

  function waitForMessage(
    matches: (message: IpcResponse) => boolean,
  ): Promise<IpcResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(
          new Error(`Timed out waiting for test API. Output:\n${childOutput}`),
        );
      }, 10_000);
      const onExit = (code: number | null) => {
        cleanup();
        reject(new Error(`Test API exited (${code}). Output:\n${childOutput}`));
      };
      const onMessage = (message: IpcResponse) => {
        if (matches(message)) {
          cleanup();
          resolve(message);
        }
      };
      const cleanup = () => {
        clearTimeout(timeout);
        child.off('exit', onExit);
        child.off('message', onMessage);
      };
      child.on('exit', onExit);
      child.on('message', onMessage);
    });
  }

  async function sendCommand(
    command: Record<string, unknown>,
  ): Promise<IpcResponse> {
    const requestId = randomUUID();
    child.send?.({ ...command, requestId });
    const response = await waitForMessage(
      (message) => message.requestId === requestId,
    );
    if (response.type === 'error') throw new Error(response.error);
    return response;
  }

  async function getOutbox(): Promise<MailEntry[]> {
    const response = await sendCommand({ type: 'mail:get' });
    return response.outbox ?? [];
  }

  async function registerAgent(
    registration = validRegistration,
    forwardedFor = '198.51.100.10',
  ): Promise<{
    agent: ReturnType<typeof request.agent>;
    response: Response;
  }> {
    const agent = request.agent(apiUrl);
    const response = await agent
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('X-Forwarded-For', forwardedFor)
      .send(registration)
      .expect(201);
    return { agent, response };
  }

  it('registers, sets scoped httpOnly cookies, authenticates /me, and validates input', async () => {
    const { agent, response } = await registerAgent();
    expect(response.body).toEqual({
      user: expect.objectContaining({
        email: 'student@example.com',
        name: 'Student User',
        phone: '+201001234567',
        role: Role.STUDENT,
      }),
    });
    expect(response.body.user).not.toHaveProperty('passwordHash');
    const accessCookie = cookies(response).find((cookie) =>
      cookie.startsWith('access_token='),
    );
    const refreshCookie = cookies(response).find((cookie) =>
      cookie.startsWith('refresh_token='),
    );
    expect(accessCookie).toEqual(expect.stringContaining('HttpOnly'));
    expect(accessCookie).toEqual(expect.stringContaining('Path=/'));
    expect(accessCookie).toEqual(expect.stringContaining('SameSite=Lax'));
    expect(refreshCookie).toEqual(expect.stringContaining('HttpOnly'));
    expect(refreshCookie).toEqual(expect.stringContaining('Path=/api/v1/auth'));
    expect(refreshCookie).toEqual(expect.stringContaining('SameSite=Lax'));
    await agent.get('/api/v1/auth/me').expect(200);

    await request(apiUrl)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.11')
      .send(validRegistration)
      .expect(409)
      .expect(({ body }: Response) => {
        expect(body.message).toBe('Unable to create account');
      });
    await request(apiUrl)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.12')
      .send({ ...validRegistration, email: 'phone@example.com', phone: '0100' })
      .expect(400);
    await request(apiUrl)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.13')
      .send({
        ...validRegistration,
        email: 'short@example.com',
        password: 'short',
      })
      .expect(400);
  });

  it('logs in and gives wrong, unknown, and inactive accounts the same 401', async () => {
    const { agent } = await registerAgent(validRegistration, '198.51.100.20');
    await request(apiUrl)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.21')
      .send({
        email: validRegistration.email,
        password: validRegistration.password,
      })
      .expect(200)
      .expect('set-cookie', /access_token/);
    const wrong = await request(apiUrl)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.22')
      .send({ email: validRegistration.email, password: 'wrong-password' })
      .expect(401);
    const unknown = await request(apiUrl)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.23')
      .send({ email: 'unknown@example.com', password: 'wrong-password' })
      .expect(401);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: validRegistration.email },
    });
    await sendCommand({ type: 'identity:deactivate', userId: user.id });
    const inactive = await request(apiUrl)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.24')
      .send({
        email: validRegistration.email,
        password: validRegistration.password,
      })
      .expect(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(inactive.body).toEqual(wrong.body);
    expect(
      await prisma.session.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('rotates refresh tokens and revokes a family when a rotated token is reused after grace', async () => {
    const { response: registered } = await registerAgent(
      validRegistration,
      '198.51.100.30',
    );
    const firstRefresh = cookiePair(registered, 'refresh_token');
    const firstRotation = await request(apiUrl)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', firstRefresh)
      .expect(200);
    const secondRefresh = cookiePair(firstRotation, 'refresh_token');
    await request(apiUrl)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', firstRefresh)
      .expect(401);
    const secondRotation = await request(apiUrl)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', secondRefresh)
      .expect(200);
    const newestRefresh = cookiePair(secondRotation, 'refresh_token');

    const secondToken = secondRefresh.slice(secondRefresh.indexOf('=') + 1);
    const rotated = await prisma.session.findUniqueOrThrow({
      where: { refreshTokenHash: hashRefreshToken(secondToken) },
    });
    if (!rotated.lastUsedAt) {
      throw new Error('Rotated session did not record lastUsedAt');
    }
    await sendCommand({
      type: 'clock:set',
      now: new Date(rotated.lastUsedAt.getTime() + 10_001).toISOString(),
    });
    await request(apiUrl)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', secondRefresh)
      .expect(401);
    await sendCommand({ type: 'clock:reset' });
    await request(apiUrl)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', newestRefresh)
      .expect(401);
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('logs out idempotently, revokes the current session, and clears both cookies', async () => {
    const { agent } = await registerAgent(validRegistration, '198.51.100.40');
    const logout = await agent
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .expect(204);
    expect(cookies(logout)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^access_token=;/),
        expect.stringMatching(/^refresh_token=;/),
      ]),
    );
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
    await agent.get('/api/v1/auth/me').expect(401);
    await agent.post('/api/v1/auth/logout').set('Origin', origin).expect(204);
  });

  it('resets a password once from the test outbox and revokes every session', async () => {
    const { agent } = await registerAgent(validRegistration, '198.51.100.50');
    await request(apiUrl)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.51')
      .send({
        email: validRegistration.email,
        password: validRegistration.password,
      })
      .expect(200);
    await request(apiUrl)
      .post('/api/v1/auth/forgot-password')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.52')
      .send({ email: validRegistration.email, locale: 'en' })
      .expect(202);
    let outbox = await getOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.resetLink).toContain('/en/reset-password?token=');
    const resetToken = extractResetToken(outbox[0]!.resetLink);
    await request(apiUrl)
      .post('/api/v1/auth/reset-password')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.53')
      .send({ token: resetToken, password: 'new-safe-password' })
      .expect(204);
    await agent.get('/api/v1/auth/me').expect(401);
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
    await request(apiUrl)
      .post('/api/v1/auth/reset-password')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.54')
      .send({ token: resetToken, password: 'another-password' })
      .expect(400);
    await request(apiUrl)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.55')
      .send({ email: validRegistration.email, password: 'new-safe-password' })
      .expect(200);

    await request(apiUrl)
      .post('/api/v1/auth/forgot-password')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.56')
      .send({ email: validRegistration.email })
      .expect(202);
    outbox = await getOutbox();
    const expiredToken = extractResetToken(outbox.at(-1)!.resetLink);
    await prisma.passwordReset.update({
      where: { tokenHash: hashResetToken(expiredToken) },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await request(apiUrl)
      .post('/api/v1/auth/reset-password')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.57')
      .send({ token: expiredToken, password: 'another-password' })
      .expect(400);
    const mailCount = outbox.length;
    await request(apiUrl)
      .post('/api/v1/auth/forgot-password')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.58')
      .send({ email: 'unknown@example.com' })
      .expect(202);
    expect(await getOutbox()).toHaveLength(mailCount);
  });

  it('requires the configured origin for mutations while health remains public', async () => {
    await request(apiUrl)
      .post('/api/v1/auth/register')
      .set('X-Forwarded-For', '198.51.100.60')
      .send(validRegistration)
      .expect(403);
    await request(apiUrl)
      .post('/api/v1/auth/register')
      .set('Origin', 'https://attacker.example.com')
      .set('X-Forwarded-For', '198.51.100.61')
      .send(validRegistration)
      .expect(403);
    await request(apiUrl)
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('enforces @Roles for students and administrators', async () => {
    const { agent: student } = await registerAgent(
      validRegistration,
      '198.51.100.70',
    );
    await student.get('/api/v1/test/roles/admin').expect(403);
    await prisma.user.update({
      where: { email: validRegistration.email },
      data: { role: Role.ADMIN },
    });
    const admin = request.agent(apiUrl);
    await admin
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.71')
      .send({
        email: validRegistration.email,
        password: validRegistration.password,
      })
      .expect(200);
    await admin
      .get('/api/v1/test/roles/admin')
      .expect(200)
      .expect({ ok: true });
  });

  it('throttles login after five attempts for the same forwarded IP and email', async () => {
    const makeAttempt = () =>
      request(apiUrl)
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-Forwarded-For', '198.51.100.80')
        .send({ email: 'throttle@example.com', password: 'wrong-password' });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await makeAttempt().expect(401);
    }
    const throttled = await makeAttempt();
    if (throttled.status !== 429) {
      throw new Error(
        `Expected 429, received ${throttled.status}: ${JSON.stringify(throttled.body)}\n${childOutput}`,
      );
    }
  });
});
