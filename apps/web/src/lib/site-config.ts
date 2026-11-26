/**
 * Single source of truth for the public origin.
 * - DEPLOY_ENV=production: SITE_URL is required, must be https and not localhost.
 *   Canonicals, sitemap and indexable robots are emitted.
 * - Anything else (local QA, previews): no canonical, no sitemap entries, noindex.
 */
export interface SiteConfig {
  isProduction: boolean;
  origin: string | null;
}

export function resolveSiteConfig(env: Record<string, string | undefined>): SiteConfig {
  const isProduction = env.DEPLOY_ENV === 'production';
  const raw = env.SITE_URL?.trim();
  if (!isProduction) return { isProduction, origin: null };
  if (!raw) throw new Error('DEPLOY_ENV=production requires SITE_URL (e.g. https://example.com).');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`SITE_URL is not a valid URL: ${raw}`);
  }
  if (url.protocol !== 'https:') throw new Error('SITE_URL must use https in production.');
  if (['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(url.hostname))
    throw new Error('SITE_URL must not point at localhost in production.');
  // Reserved test domains (RFC 2606/6761) are only allowed for the QA build (`pnpm build:prod-check`).
  if (/\.(example|test|invalid|localhost)$/.test(url.hostname) && env.LOVERT_QA_BUILD !== '1')
    throw new Error(`SITE_URL ${url.origin} is a reserved test domain. Set the real production domain.`);
  if (url.pathname !== '/' || url.search || url.hash)
    throw new Error('SITE_URL must be an origin only, without path, query or hash.');
  return { isProduction, origin: url.origin };
}
