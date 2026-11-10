import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

const UPLOAD_ROUTE = '/api/v1/admin/lessons/:id/videos/local';

/**
 * Development and e2e only. A large video must not be buffered by the Next dev
 * server's /api rewrite, so the admin uploader posts straight to the API
 * origin (`API_PUBLIC_ORIGIN`). That is a cross-origin request, so this
 * answers CORS for exactly one route, for exactly `APP_URL`'s origin, with
 * credentials. Never mounted in production, where Caddy serves both from one
 * origin. The Origin guard still applies: the browser's Origin is `APP_URL`.
 */
export function enableDevVideoUploadCors(
  app: NestExpressApplication,
  appUrl: string,
): void {
  if (process.env.NODE_ENV === 'production') return;
  const allowed = new URL(appUrl).origin;

  app.use(
    UPLOAD_ROUTE,
    (request: Request, response: Response, next: NextFunction) => {
      if (request.get('origin') !== allowed) return next();
      response.setHeader('Access-Control-Allow-Origin', allowed);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.vary('Origin');
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        response.setHeader(
          'Access-Control-Allow-Headers',
          request.get('access-control-request-headers') ?? 'content-type',
        );
        response.setHeader('Access-Control-Max-Age', '600');
        response.status(204).end();
        return;
      }
      next();
    },
  );
}
