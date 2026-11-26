import type { MetadataRoute } from 'next';
import { GUIDES } from '@/content/guides';
import { INFO_PAGES, TOOLS } from '@/content/tools';
import { absoluteUrl, site } from '@/lib/site';

export const dynamic = 'force-static';

/** Only canonical, public, indexable pages. Empty outside production deploys. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!site.isProduction) return [];
  const paths = ['/', ...TOOLS.map((t) => t.path), ...INFO_PAGES.map((p) => p.path), ...GUIDES.map((g) => g.path)];
  return paths.map((p) => ({ url: absoluteUrl(p)! }));
}
