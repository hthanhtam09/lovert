---
name: audit-discoverability
description: Audit Lovert's rendered HTML, crawl/index signals, internal links, content and structured data for SEO/GEO. Use when asked for an SEO audit, indexing check, pre-launch check, or "why isn't page X found".
---

# Audit discoverability

Work from built output, not source assumptions.

1. Build both modes: `pnpm build && node scripts/check-build.mjs` (preview) and `pnpm build:prod-check` (production with a test origin).
2. Rendered HTML (`apps/web/out/*.html`): per page record title, description, canonical, robots meta, one H1, OG tags,
   JSON-LD types, and whether the main answer text is present without JS (also `curl` the served page via `pnpm serve:out`).
3. Crawl/index: `robots.txt`, `sitemap.xml` (only canonical indexable URLs, no queries), 404 status for unknown paths,
   `.html`/trailing-slash redirects, `_headers` (`X-Robots-Tag: noindex` on `*.pages.dev`). On production, also fetch live headers.
4. Internal links: every catalog tool linked from nav, home and at least one related tool page; no dead links.
5. Content (GEO): each page opens with the user's question answered in plain words, then example, conditions, limits,
   method of measurement. Tested numbers carry date and environment (`docs/benchmarks.md`).
6. Structured data: only `WebSite` (home) and `BreadcrumbList` (visible breadcrumbs). Flag any invented rating/review/FAQ.
7. AI crawlers: compare `robots.ts` with the policy in `docs/seo-geo.md` (e.g. OAI-SearchBot vs GPTBot). Don't treat llms.txt as a requirement.

## Report
Table: issue · evidence (file/URL + excerpt or command output) · impact (**blocker**: prevents indexing/wrong canonical;
**high**: hurts ranking/understanding of a key page; **medium**; **low**) · fix. Mark items needing the live domain as "pending domain".
