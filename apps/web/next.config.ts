import type { NextConfig } from 'next';
import { resolveSiteConfig } from './src/lib/site-config';

// Fails the build early for production deploys without a valid public origin.
resolveSiteConfig(process.env);

const config: NextConfig = {
  output: 'export',
  trailingSlash: false,
  images: { unoptimized: true },
  reactStrictMode: true,
  transpilePackages: ['@lovert/core'],
  poweredByHeader: false,
};

export default config;
