import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Fields that must never reach the logs. The request serializer below already
 * drops headers and bodies; redaction is a second line of defence in case a
 * handler or a future serializer change logs them.
 */
export const LOG_REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["proxy-authorization"]',
  'req.headers["x-api-key"]',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'req.body',
  'req.query.token',
  'req.query.hmac',
  'body',
  'headers.cookie',
  'headers.authorization',
  'password',
  'token',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
] as const;

type LoggedRequest = IncomingMessage & {
  id?: unknown;
  remoteAddress?: string;
  remotePort?: number;
};

export function createHttpLoggerOptions() {
  return {
    redact: {
      paths: [...LOG_REDACT_PATHS],
      censor: '[REDACTED]',
    },
    serializers: {
      req(request: LoggedRequest) {
        return {
          id: request.id,
          method: request.method,
          // Query strings can carry reset/webhook tokens: never log them.
          url: request.url?.split('?', 1)[0],
          remoteAddress: request.remoteAddress,
          remotePort: request.remotePort,
        };
      },
      res(response: ServerResponse) {
        return { statusCode: response.statusCode };
      },
    },
    genReqId(request: IncomingMessage, response: ServerResponse): string {
      const incoming = request.headers['x-request-id'];
      const requestId =
        typeof incoming === 'string' && incoming.length > 0
          ? incoming
          : randomUUID();
      response.setHeader('x-request-id', requestId);
      return requestId;
    },
  };
}
