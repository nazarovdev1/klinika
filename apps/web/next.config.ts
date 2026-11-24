import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@shifo/contracts'],
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true }, // lint runs as its own CI step
};

export default withNextIntl(config);
