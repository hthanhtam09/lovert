# Lovert

File tools (image, PDF, documents later) with a web app and, later, an API that share one core.
v1 ships two tools that run fully in the browser: `/compress-image` and `/images-to-pdf`.
Public UI and content are in English.

## Architecture
- `packages/core` (`@lovert/core`): runtime-neutral TypeScript. Units, format detection, validation,
  limits, candidate search policy, output verification, error codes, PDF page layout. Rules: `.claude/rules/core.md`.
- `apps/web` (`@lovert/web`): Next.js App Router, static export for Cloudflare Pages. UI, routing,
  metadata, Web Worker, canvas/pdf-lib/PDF.js adapters, downloads. Rules: `.claude/rules/web.md`, SEO: `.claude/rules/seo.md`.
- Tool catalog: `apps/web/src/content/tools.ts` drives nav, home, tool pages and sitemap.
- Tool gate: every public tool needs a contract in `tests/contracts/tool-contracts.ts` and passing tagged tests on all
  Playwright projects. Rules: `.claude/rules/tool-gate.md`. QA workflow: `.claude/skills/lovert-tool-qa/SKILL.md`.
- Details: `docs/architecture.md`, `docs/api.md`, `docs/launch-indexing.md`, `docs/seo-geo.md`, `docs/benchmarks.md`.

## Commands (Node 24, pnpm 10 via corepack)
- `pnpm dev` · `pnpm build` (static export → `apps/web/out`) · `pnpm lint` · `pnpm typecheck` · `pnpm test` (Vitest)
- `pnpm test:e2e` (Playwright: chromium, firefox, webkit, mobile-chromium, mobile-webkit, against the built export; run `pnpm build` first)
- `pnpm test:report` (unit + JSON report) · `pnpm gate` (tool gate, merge) · `pnpm test:e2e:release && pnpm gate:release` (before a release)
- `node scripts/check-build.mjs` (SEO/link integrity of the export) · `pnpm build:prod-check` (production-mode build + check)
- `pnpm serve:out` serves the export like Cloudflare Pages on :4173.

## Local-first principles
- v1 tools never upload. No file content, names, previews, extracted text or paths in telemetry or requests.
- Never claim "in your browser"/"not uploaded" for an operation that sends data to a server.
- Measure the exact bytes the user downloads. Preview and download use the same output.
- An over-limit result is never shown as success: show the numbers and one concrete change.
- Do not add Supabase, storage, queues, auth, billing or API endpoints until a feature needs them (see `docs/api.md`).

## Definition of done
1. `pnpm lint && pnpm typecheck && pnpm test && pnpm build && node scripts/check-build.mjs` pass.
2. `pnpm test:report`, `pnpm test:e2e` and `pnpm gate` pass on all projects, with new fixtures for the risky cases of the change
   (a change to a tool's output, decoder/encoder, worker, preview or download follows `.claude/rules/tool-gate.md`).
3. New public page: catalog entry, unique title/description/H1, content readable without JS, `pnpm build:prod-check` passes.
4. Report each check as pass / fail / not run. Never call a local check a production deploy.
