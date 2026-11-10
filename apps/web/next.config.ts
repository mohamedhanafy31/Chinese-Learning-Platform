import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: process.env.E2E_NEXT_START === '1' ? undefined : 'standalone',
  transpilePackages: ['@app/shared'],
  experimental: {
    // Admin image uploads (up to 10 MB plus multipart framing) pass through
    // the dev/e2e /api rewrite; the default 10 MB buffer would truncate them.
    proxyClientMaxBodySize: '12mb',
  },
  async rewrites() {
    const apiUrl = (
      process.env.INTERNAL_API_URL ?? 'http://localhost:4000'
    ).replace(/\/$/, '');

    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
      // Development and e2e only: production Caddy serves /media from the
      // shared uploads volume before the request reaches Next.
      {
        source: '/media/:path*',
        destination: `${apiUrl}/media/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
