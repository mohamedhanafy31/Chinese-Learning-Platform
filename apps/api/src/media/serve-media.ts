import type { NestExpressApplication } from '@nestjs/platform-express';

import { MediaStorage } from './media-storage';

/**
 * Development and test only: production Caddy serves /media/* straight from
 * the shared uploads volume. Never mounted when NODE_ENV is "production".
 */
export function serveUploadedImages(app: NestExpressApplication): void {
  if (process.env.NODE_ENV === 'production') return;
  app.useStaticAssets(app.get(MediaStorage).imagesDir, {
    prefix: '/media/',
    index: false,
    dotfiles: 'ignore',
    immutable: true,
    maxAge: '1y',
    setHeaders(response) {
      response.setHeader('X-Content-Type-Options', 'nosniff');
    },
  });
}
