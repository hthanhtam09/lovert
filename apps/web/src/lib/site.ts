import { resolveSiteConfig } from './site-config';

export const site = resolveSiteConfig({
  DEPLOY_ENV: process.env.DEPLOY_ENV,
  SITE_URL: process.env.SITE_URL,
  LOVERT_QA_BUILD: process.env.LOVERT_QA_BUILD,
});

export const SITE_NAME = 'Lovert';

/** Absolute canonical URL in production, null elsewhere (never a placeholder). */
export function absoluteUrl(path: string): string | null {
  if (!site.origin) return null;
  // Home is the bare origin: Next normalizes canonical "https://x/" to "https://x", so sitemap matches it.
  return path === '/' ? site.origin : `${site.origin}${path}`;
}
