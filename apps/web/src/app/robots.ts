import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/site-url';

/** Pages that exist per locale but should never be indexed. */
const privatePaths = [
  'admin',
  'dashboard',
  'session',
  'login',
  'register',
  'forgot-password',
  'reset-password',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: privatePaths.map((path) => `/*/${path}`),
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
