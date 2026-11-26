---
name: qa-conversion
description: QA a Lovert conversion tool with fixtures — output correctness, size limits, quality, resources, browsers and benchmarks. Use after changing a tool, before launch, or when asked to benchmark/compare output.
---

# QA a conversion

1. **Environment** — Record date, machine/OS, browser + version (Playwright projects: chromium, webkit, mobile-chromium),
   commit, and whether the build was the static export (`pnpm build`, served by `pnpm serve:out`).
2. **Fixtures** — Use generators in `tests/fixtures/` only (small text, signature-like strokes, transparency, EXIF-rotated,
   high resolution, multi-page sets). Never use files without a usage right.
3. **Correctness** — For each fixture: real output format (magic bytes), exact bytes vs. limit (at, just over), pixel size,
   page count/order, preview bytes == download bytes. `pnpm test` + `pnpm test:e2e`.
4. **Quality** — Compare before/after at the same zoom (100% and 200%) for text and thin strokes; note visible artifacts.
5. **Resources** — Time per job, number of candidates tried, peak memory if measurable (Chrome DevTools performance monitor),
   behaviour at the pixel/memory limits.
6. **Browsers** — Chromium, WebKit, mobile viewport; note encoder gaps (e.g. WebKit cannot encode WebP → FORMAT_MISMATCH).
7. **Competitors** — Only with fixtures we own, same input and same target. If not run: write "not measured".
8. **Record** in `docs/benchmarks.md`: input, environment, result, and what is still unverified. Keep our numbers and competitor numbers in separate tables.
