import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: process.env.E2E_NEXT_START === '1' ? undefined : 'standalone',
  transpilePackages: ['@app/shared'],
  async rewrites() {
    const apiUrl = (
      process.env.INTERNAL_API_URL ?? 'http://localhost:4000'
    ).replace(/\/$/, '');

    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
