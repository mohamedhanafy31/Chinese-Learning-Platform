import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

import request from 'supertest';

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve an integration-test port'));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(address.port);
        }
      });
    });
  });
}

async function waitForServer(url: string, child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API exited before becoming ready (${child.exitCode})`);
    }

    try {
      const response = await fetch(`${url}/api/v1/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('API did not become ready within five seconds');
}

describe('health endpoints (e2e)', () => {
  let apiUrl: string;
  let child: ChildProcess;
  let output = '';

  beforeAll(async () => {
    const port = await reservePort();
    apiUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['dist/main.js'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    try {
      await waitForServer(apiUrl, child);
    } catch (error) {
      throw new Error(`API did not start. Output:\n${output}`, {
        cause: error,
      });
    }
  });

  afterAll(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    }
  });

  it('serves liveness without a database query', async () => {
    await request(apiUrl)
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('serves readiness after a successful database query', async () => {
    await request(apiUrl)
      .get('/api/v1/ready')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
