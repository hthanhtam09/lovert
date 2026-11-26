import type { Metadata } from 'next';
import { absoluteUrl, site, SITE_NAME } from './site';

export function pageMetadata(args: { path: string; title: string; description: string; absoluteTitle?: boolean }): Metadata {
  const canonical = absoluteUrl(args.path);
  const title = args.absoluteTitle ? { absolute: args.title } : args.title;
  return {
    title,
    description: args.description,
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: args.title,
      description: args.description,
      ...(canonical ? { url: canonical, images: [{ url: absoluteUrl('/opengraph-image')!, width: 1200, height: 630 }] } : {}),
    },
    twitter: { card: 'summary_large_image', title: args.title, description: args.description },
    robots: site.isProduction ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  // Only emit when absolute URLs exist (production). Breadcrumbs are visible on the page.
  if (!site.origin) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

export function websiteJsonLd() {
  if (!site.origin) return null;
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: absoluteUrl('/') };
}
