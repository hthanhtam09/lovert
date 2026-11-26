---
name: lovert-tool-qa
description: Required QA for any change that can alter what a Lovert tool outputs or lets the user download — adding a tool, changing a decoder/encoder, the worker/runner, result-affecting UI, or preview/download logic. Scopes the change from the diff, picks fixtures, writes assertions on the downloaded bytes, runs unit/E2E/static checks and reports PASS / FAIL / UNSUPPORTED / NOT RUN through the tool gate.
---

# Lovert tool QA

The gate (`scripts/tool-gate.mjs`) is the source of truth: a tool ships only when every required case in its contract
(`tests/contracts/tool-contracts.ts`) ran and passed on every required project. Rule: `.claude/rules/tool-gate.md`.
Full case catalogue and assertion recipes: [reference.md](reference.md).

## 1. Scope from the diff
`git diff --stat` (and `git status` for untracked files), then map paths to tools:

| Changed path | Tools in scope |
|---|---|
| `packages/core/src/data.ts` | csv-to-json, json-to-csv |
| `packages/core/src/{format,validate,integrity,dimensions,verify,search,units}.ts` | every image tool + images-to-pdf |
| `packages/core/src/{layout,limits}.ts`, `apps/web/src/lib/pdf/**` | images-to-pdf (limits: all) |
| `apps/web/src/lib/image/**` | compress-image + the six converters + images-to-pdf (decode) |
| `apps/web/src/lib/{runner,convert.worker,worker-protocol}.ts` | all tools (job order, cancel, late results) |
| `CompressImageTool.tsx`, `ConvertImagePage.tsx` | compress-image + the six converters |
| `ImagesToPdfTool.tsx`, `PdfPreview.tsx` | images-to-pdf |
| `DataConvertTool.tsx` | csv-to-json, json-to-csv |
| `FilePicker`, `PaneSwitch`, `Checks`, `LimitInput`, `use-object-url`, `layout.tsx`, `globals.css`, `tool.module.css` | all tools (a11y, header, CTA, preview/download) |
| `content/tools.ts`, `app/<slug>/page.tsx`, `sitemap.ts`, `seo.ts` | the tool's `static` case + `pnpm build:prod-check` |

A new tool: catalogue entry + route + contract + fixtures + unit + E2E in the same change (see the rule).

## 2. Fixtures
Only generators in `tests/fixtures/` (`png.ts`, `exif.ts`, `encoded.ts` + `make-encoded.mjs`, `webp.ts`). Never a file without a usage right.
Pick two valid inputs that differ in size *and* content (so a result tells which input made it), plus: 0 bytes, wrong content under the
right name, truncated, valid content under a wrong name, alpha, EXIF 3/6/8 on the asymmetric JPEG, animated (APNG / animated WebP),
header-only oversize, and the exact limit boundaries. Large files (≥ 20 MB) go in `@release` tests.

## 3. Assertions (on what the user gets)
- Download through the UI (`downloadVia`) and assert on those bytes: magic bytes or a re-parse, name/extension, exact byte count,
  decoded pixel size, representative pixels (flat colour areas, tolerance for lossy codecs), page count/size/order from the PDF.
- Preview == download: SHA-256 of the preview source (`after-img`, `pdf-pages[data-sha256]`, preview text) against the file.
- Races: drive order with `onJobSent` (job-sent mark) and `__lovertHold` (held reads), never with fixed sleeps.
- Capabilities from runtime signals (`data-webp-encoder`, probe), never from the browser name. Missing capability →
  assert the UI (alert, disabled action, no mislabeled download) and annotate `unsupported` via `webpEncodeAvailable`.
- Tag every test with the cases it proves: `[slug:case]` in the title (several allowed). Unknown tags fail the gate.

## 4. Run
```
pnpm lint && pnpm typecheck && pnpm test:report       # unit report → reports/unit.json
pnpm build && node scripts/check-build.mjs             # static export + SEO/link integrity
pnpm test:e2e                                          # 5 projects → reports/e2e.json (+ html, traces in test-results/)
pnpm gate                                              # merge gate → reports/tool-gate-merge.md
pnpm build:prod-check                                  # production metadata, canonical, sitemap
# before a release:
pnpm test:e2e:release && pnpm gate:release
```
Iterate on one tool with `-g '\[png-to-jpg:'` and `--project=chromium`, but the gate needs the full run.

## 5. Report
Use the gate table (`reports/tool-gate-merge.md`): tool | required | pass | fail | unsupported (verified) | not run, then:
changed files, commands run with results, bugs found (slug, project, fixture, assertion, fix), and what is unverified.
- **PASS** only from a passing tagged test. **UNSUPPORTED** only when the test detected the gap and verified the UI handling.
- **NOT RUN** for anything required that did not run (missing env, skipped, not written) — it blocks.
- Playwright projects are emulations (Pixel 7 / iPhone 13 viewports, Playwright WebKit ≠ iOS Safari). Say so; never call
  them real devices. Never call a local run a production deploy.
- "READY" only when the gate passes (merge, and release before a release) with no known regression.
