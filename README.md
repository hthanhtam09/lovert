# Lovert

Convert files in your browser. "Lovert" = **lo**cal + con**vert**. (Formerly LocalConv.)

Image and PDF tools that make files fit a size limit and show the result before download.
v1: **Compress image** (`/compress-image`) and **Images to PDF** (`/images-to-pdf`), both processed in the browser.

## Setup
Requires Node 24 (`.nvmrc`) and pnpm 10 (pinned in `package.json`, enable with `corepack enable`).

```bash
pnpm install
pnpm exec playwright install chromium webkit   # once, for e2e
```

## Develop
```bash
pnpm dev            # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm test           # Vitest: core + web libs
pnpm build          # static export → apps/web/out (preview mode: noindex, no canonical, empty sitemap)
node scripts/check-build.mjs
pnpm test:e2e       # Playwright against the export (Chromium, WebKit, Pixel 7)
pnpm check          # lint + typecheck + test + build + check-build
```

## Production build
```bash
DEPLOY_ENV=production SITE_URL=https://your-domain pnpm build
node scripts/check-build.mjs
```
The build fails if `DEPLOY_ENV=production` and `SITE_URL` is missing, not https, localhost, or has a path.
`pnpm build:prod-check` builds with the reserved QA origin `https://lovert.example` and moves the result to `apps/web/out-prodcheck`;
reserved origins are rejected in any other build, and `check-build` fails an artifact that contains one.
Cloudflare build command: `pnpm build:deploy`. Extra local tools: `pnpm bench` (timing + samples), `pnpm lighthouse` (mobile, local export).

## Deploy preview (Cloudflare Pages) — not done yet, needs an account
- Build command: `pnpm install --frozen-lockfile && pnpm build`, output directory `apps/web/out`, env `NODE_VERSION=24`.
- Production branch env: `DEPLOY_ENV=production`, `SITE_URL=https://<domain>`. Preview branches: leave both unset (noindex).
- `apps/web/public/_headers` sets security headers and `X-Robots-Tag: noindex` on `*.pages.dev`.
- Local approximation of Pages routing: `pnpm serve:out`.

## Docs
- [Architecture](docs/architecture.md) · [API plan](docs/api.md) · [Launch & indexing](docs/launch-indexing.md)
- [SEO/GEO & competition plan](docs/seo-geo.md) · [Benchmarks](docs/benchmarks.md) · [CLAUDE.md](CLAUDE.md)
