import { fork, type ChildProcess } from 'node:child_process';

import request from 'supertest';

describe('disabled payment API (e2e)', () => {
  let apiUrl: string;
  let child: ChildProcess;
  let childOutput = '';

  beforeAll(async () => {
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

  afterAll(async () => {
    if (child?.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    }
  });

  it.each([
    ['get', '/api/v1/billing/availability'],
    ['post', '/api/v1/billing/checkout'],
    ['post', '/api/v1/webhooks/paymob'],
  ] as const)('does not expose %s %s', async (method, path) => {
    await request(apiUrl)[method](path)
      .set('Origin', 'http://localhost:3000')
      .send({})
      .expect(404);
  });
});
