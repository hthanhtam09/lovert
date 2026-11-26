# Benchmarks

All numbers below are **internal, local** measurements. No competitor has been measured.

## Environment (2026-11-21)
- MacBook, Apple M1, 16 GB RAM, macOS 26.6.2. Node 24.14.1.
- Playwright 1.65.1: Chromium (desktop), WebKit (Playwright build webkit-2388, desktop Safari profile), Pixel 7 emulation on Chromium.
  **Playwright WebKit is not iPhone Safari.** No real iPhone or Android device was tested.
- Static export (`pnpm build`, webpack) served by `scripts/serve-static.mjs` (emulates Pages routing and `_headers`).
- The machine was under heavy unrelated load during the session (load average 8–54, with stalls of roughly 15–17 minutes).
  Timings are single runs and only roughly indicative.

## Timing — `pnpm bench` (tests/e2e/bench.spec.ts)
Inputs are generated in the page (seeded gradient + shapes + grain, JPEG q 0.9 from the same browser), so input bytes differ per engine.
Time is wall clock from clicking the button to the final status (includes Playwright polling, about 100 ms).

| Browser | Input | Input bytes | Target | Time | Result |
|---|---|---|---|---|---|
| Chromium | 1200×900 (1.1 MP) | 261,092 | JPEG ≤ 500 KB, no resize | 179 ms | ok · 317.0 KB · q95 |
| Chromium | 4000×3000 (12 MP) | 2,409,279 | JPEG ≤ 500 KB | 825 ms | ok · 483.0 KB · q57 |
| Chromium | 8000×6000 (48 MP) | 9,120,752 | JPEG ≤ 500 KB | 1,327 ms | **over_limit** · 547.5 KB at q30 (no resize allowed) |
| WebKit | 1200×900 | 458,628 | JPEG ≤ 500 KB | 158 ms | ok · 466.7 KB · q95 |
| WebKit | 4000×3000 | 4,417,302 | JPEG ≤ 500 KB | 1,377 ms | ok · 495.2 KB · q37 |
| WebKit | 8000×6000 | 16,942,842 | JPEG ≤ 500 KB | 2,206 ms | **over_limit** · 1.26 MB at q30 |
| Chromium | 3 × 4000×3000 | — | PDF A4 ≤ 1 MB, lower resolution allowed | 3,373 ms | ok · 989.1 KB · q47 · full resolution |
| WebKit | 3 × 4000×3000 | — | PDF A4 ≤ 1 MB, lower resolution allowed | 8,378 ms | ok · 975.4 KB · q35 · 90% resolution |

Responsiveness: one `requestAnimationFrame` right after each job took 0–1 ms (the main thread was free; the work runs in the worker).

**Memory: not measured.** `performance.memory` only covers the main-thread JS heap, not worker canvases or decoded bitmaps,
so it cannot be used to explain image memory. A reliable number would need OS-level per-process sampling of the browser's GPU/renderer processes.

## Limits and early refusal
- Images over 50 MP or 16,384 px per side are refused **from the file header** (`readDimensions` in core: PNG IHDR, JPEG SOFn, WebP VP8/VP8L/VP8X)
  before any decode. E2E uses header-only fake JPEGs (8200×6200, 17000×100): a decode would have produced `DECODE_FAILED`; instead the
  pixel message appears in < 5 s and the next valid file compresses normally.
- A real 48 MP image is processed (see timing). The 50 MP boundary itself is unit-tested (exactly 8000×6250 is accepted).

## Cancellation
Changing the file during a job: the UI discards at once (`lovert:job-discarded` mark). The worker either stops the old job at its next
candidate (`lovert:job-stopped`) or, if the job had already finished, its result is dropped (`lovert:job-late-result`). Then a new job
runs normally. Both outcomes were observed. On the main-thread fallback only the discard applies.

## Quality samples (small text, fake signature)
Source: `docs/benchmarks/samples/text-source.png` (1200×800, text at 7–14 px, synthetic strokes at 1/1.5/2.5 px; not a real document or signature).
Outputs and 200% nearest-neighbour crops (source above, output below) are in `docs/benchmarks/samples/`, named
`text-<browser>-<format>-<limit>kb.*` and `*-crop200.png`. Regenerate with `pnpm bench --grep "small text"`.

| Browser | Target | Result | Time |
|---|---|---|---|
| Chromium | JPEG ≤ 150 KB | 94.0 KB · q95 · 1200×800 | 112 ms |
| Chromium | JPEG ≤ 60 KB | 59.7 KB · q80 | 104 ms |
| Chromium | WebP ≤ 60 KB | 57.3 KB · q95 | 124 ms |
| WebKit | JPEG ≤ 150 KB | 112.6 KB · q95 | 121 ms |
| WebKit | JPEG ≤ 60 KB | 59.9 KB · q48 | 240 ms |
| WebKit | WebP | not offered (probe: encoder returns non-WebP bytes) | — |

The visual verdict (legibility of 7–8 px text and 1 px strokes) is left to a human looking at the `*-crop200.png` files;
no automated sharpness score was computed.

## Lighthouse (mobile, simulated throttling, Lighthouse 12.8.2, local export on localhost)
| Page | Perf | A11y | Best pr. | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| `/` | 79 | 100 | 100 | 63 | 4.2 s | 0 | 130 ms |
| `/compress-image` | 85 | 100 | 100 | 63 | 4.4 s | 0 | 90 ms |
| `/images-to-pdf` | 88 | 100 | 100 | 63 | 3.9 s | 0 | 70 ms |

SEO 63 is expected for this **preview** build: it is `noindex` on purpose, and Lighthouse's "page is blocked from indexing" audit fails.
This run did not save audit-level detail to confirm that. Re-run on the production URL. Performance ran under heavy machine load.
Reproduce with `pnpm build && pnpm lighthouse`.

## Automated correctness checks (pass on chromium, webkit and mobile-chromium unless noted)
JPEG ≤ 50,000 B with preview SHA-256 == download · transparent PNG → JPEG fill · PNG over limit → suggestion · exact 300×200 ·
resize only when allowed · empty/not-image/damaged files · >50 MP refused from header · mid-job file change · WebP option from probe
(Chromium: real WebP bytes, `.webp`, preview == download; WebKit: option disabled with note) · EXIF Orientation 6 rotated exactly once
(compressed image and PDF) · PDF page order after keyboard reorder · PDF ≤ 60,000 B after serialization · image worker is a JS chunk, PDF.js worker 200 ·
no request with a body or to another origin · 404 status · content without JS.

### Full-suite stability (51 tests × run, local)
Final session: 2 of 4 full runs passed 51/51. The other runs had 2–4 tests time out at the same moment, during the machine stalls
described above, and every one of those passed when re-run (`--last-failed`). Watch this in CI on a clean runner.

## Not yet measured
- Real devices (iPhone Safari, Android Chrome); memory; repeated runs or medians.
- Competitors: **not measured**.

## Competitors
| Tool | Fixture | Target | Output bytes | Fits | Dimensions | Time | Notes |
|---|---|---|---|---|---|---|---|
| — | — | — | not measured | | | | |
