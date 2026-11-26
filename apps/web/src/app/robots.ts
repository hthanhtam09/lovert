import type { MetadataRoute } from 'next';
import { absoluteUrl, site } from '@/lib/site';

export const dynamic = 'force-static';

/**
 * Production: allow crawling, point to the sitemap. AI crawler decisions are in docs/seo-geo.md.
 * Non-production: crawling stays allowed so crawlers can SEE the noindex meta tag/header
 * (a robots Disallow would hide it and the URL could still be indexed).
 */
export default function robots(): MetadataRoute.Robots {
  if (!site.isProduction) return { rules: [{ userAgent: '*', allow: '/' }] };
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: absoluteUrl('/sitemap.xml')!,
  };
}
