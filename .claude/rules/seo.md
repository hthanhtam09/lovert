---
paths:
  - "apps/web/src/app/**"
  - "apps/web/src/content/**"
  - "apps/web/src/lib/seo.ts"
  - "apps/web/src/lib/site*.ts"
  - "apps/web/public/**"
  - "scripts/check-build.mjs"
---
# SEO rules

- Origin: only `SITE_URL` + `DEPLOY_ENV=production` (`src/lib/site-config.ts`). Production fails without a valid https,
  non-localhost origin. Non-production: no canonical, `noindex`, empty sitemap, robots without sitemap.
- Every public page: entry in `src/content/tools.ts` (or `INFO_PAGES`), metadata via `pageMetadata()`, one `<h1>`,
  unique title and description, crawlable `<Link>`s, key content server-rendered (works with JS off).
- Canonical: absolute, https, no trailing slash (home = bare origin, matching what Next emits). Query prefills such as `?max=50`
  never get their own canonical or sitemap entry. Create a new URL only when intent and content clearly differ (see `docs/seo-geo.md`).
- Sitemap: only canonical, indexable pages with real content. Never list a noindex page. Don't block noindex pages in robots.txt
  (crawlers must see the noindex).
- Structured data: `WebSite` on home, `BreadcrumbList` only where breadcrumbs are visible. No ratings, reviews, usage numbers
  or FAQ markup made up for rich results. `SoftwareApplication` only if it matches real features and Google's requirements.
- Strings are English in `src/content/` and page files; keep copy in content modules when adding locales. Add hreflang only with complete translations.
- Verify: `pnpm build && node scripts/check-build.mjs` and `pnpm build:prod-check`.
