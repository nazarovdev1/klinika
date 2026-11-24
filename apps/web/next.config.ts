import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@shifo/contracts'],
  poweredByHeader: false,
  // Same-origin API so the httpOnly SameSite=Strict refresh cookie works without CORS.
  rewrites: () =>
    Promise.resolve([
      {
        source: '/api/:path*',
        destination: `${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}/api/:path*`,
      },
    ]),
  eslint: { ignoreDuringBuilds: true }, // lint runs as its own CI step
};

export default withNextIntl(config);
