---
name: add-tool
description: Add a new Lovert tool page end to end (search need → fixtures → core → web UI → metadata → QA). Use when asked to add, build or launch a new converter/tool/route.
---

# Add a tool

1. **Need and URL decision** — Write in `docs/seo-geo.md` (candidate pages table): the task the user is trying to do,
   the real benefit vs. the closest existing tool page and nearest competitor, how success is measured, and why it needs its own URL.
   Stop if an existing page already serves the intent (add an option instead). No volume numbers without a source.
2. **Fixtures first** — Add deterministic generators to `tests/fixtures/png.ts` (or a sibling) for risky cases:
   exactly at/one byte over the limit, wrong real format, damaged file, alpha, EXIF rotation, large pixel counts.
3. **Core** (`packages/core/src`) — Pure logic only (see `.claude/rules/core.md`): validation, limits, policy, verification,
   new `ErrorCodes`. Tests in `packages/core/test/`. Run `pnpm test`.
4. **Adapter + worker** (`apps/web/src/lib/`) — Codec code next to `image/` or `pdf/`; add a request kind to
   `worker-protocol.ts`, handle it in `convert.worker.ts`, expose it in `runner.ts` with the main-thread fallback.
5. **UI** (`apps/web/src/components/<Name>Tool.tsx`) — Reuse `FilePicker`, `LimitInput`, `Checks`, `useObjectUrl`, `createJobGuard`.
   Show measured format/size/dimensions; over-limit shows numbers + one suggestion; download the previewed bytes.
6. **Page + catalog** — Add an entry in `apps/web/src/content/tools.ts`, then `apps/web/src/app/<slug>/page.tsx` with
   `pageMetadata`, `Breadcrumbs`, a short direct answer, input/output table, real examples, limits, errors, `<noscript>` note.
7. **QA** — `pnpm lint && pnpm typecheck && pnpm test && pnpm build && node scripts/check-build.mjs && pnpm build:prod-check`,
   then add `tests/e2e/<slug>.spec.ts` (include `watchNetwork` no-upload assertion) and run `pnpm test:e2e`.
   Then run the `qa-conversion` skill and record results in `docs/benchmarks.md`.
