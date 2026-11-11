import { Writable } from 'node:stream';

import { describe, expect, it } from '@jest/globals';
import { pino } from 'pino';

import { createHttpLoggerOptions } from './http-logger';

function capture(withSerializers = true): {
  lines: () => string;
  logger: ReturnType<typeof pino>;
} {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const { redact, serializers } = createHttpLoggerOptions();
  return {
    lines: () => chunks.join(''),
    logger: pino(
      withSerializers ? { redact, serializers } : { redact },
      stream,
    ),
  };
}

const secrets = [
  'access-cookie-secret',
  'refresh-cookie-secret',
  'Bearer top-secret-token',
  'hunter2-password',
  'reset-token-in-query',
  'hmac-in-query',
  'api-key-secret',
];

describe('http logger redaction', () => {
  it('redacts headers, bodies and tokens when a request-shaped object is logged', () => {
    const { lines, logger } = capture(false);
    logger.info(
      {
        req: {
          headers: {
            cookie: 'access_token=access-cookie-secret',
            authorization: 'Bearer top-secret-token',
            'x-api-key': 'api-key-secret',
          },
          body: { password: 'hunter2-password' },
          query: { token: 'reset-token-in-query', hmac: 'hmac-in-query' },
        },
        res: {
          headers: { 'set-cookie': ['refresh_token=refresh-cookie-secret'] },
        },
      },
      'request completed',
    );
    const output = lines();
    for (const secret of secrets) expect(output).not.toContain(secret);
    expect(output).toContain('[REDACTED]');
  });

  it('redacts credentials in ad hoc log objects', () => {
    const { lines, logger } = capture();
    logger.warn({
      user: {
        password: 'hunter2-password',
        refreshToken: 'refresh-cookie-secret',
      },
      body: { password: 'hunter2-password' },
    });
    const output = lines();
    expect(output).not.toContain('hunter2-password');
    expect(output).not.toContain('refresh-cookie-secret');
  });

  it('serializes requests without headers, bodies or query strings', () => {
    const { lines, logger } = capture();
    logger.info({
      req: {
        id: 'abc',
        method: 'POST',
        url: '/api/v1/auth/reset-password?token=reset-token-in-query',
        headers: { cookie: 'access_token=access-cookie-secret' },
        body: { password: 'hunter2-password' },
      },
    });
    const entry = JSON.parse(lines()) as { req: Record<string, unknown> };
    expect(entry.req).toEqual({
      id: 'abc',
      method: 'POST',
      url: '/api/v1/auth/reset-password',
    });
    for (const secret of secrets) expect(lines()).not.toContain(secret);
  });
});
