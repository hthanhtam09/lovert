# Lovert tool QA — case catalogue

Every case below is declared in `tests/contracts/tool-contracts.ts` (id in `code`). Layer: **U** = Vitest, **E** = Playwright on all
five projects, **R** = Playwright `@release` job. Where a file proves it: `tool-common.spec.ts` (shared matrix, all tools),
`<tool>.contract.spec.ts` / `convert-image.spec.ts` / `data-convert.spec.ts` (tool-specific), `packages/core/test/contract-cases.test.ts` (unit).

## Shared matrix (every tool) — E
| Case | How it is verified |
|---|---|
| `flow` | Home → library card → route; pick A; run; download via UI; name and content of the saved bytes identify A |
| `empty` | 0-byte file → alert, no download, action disabled |
| `mismatch` | Content that is not the route's input under the route's extension (text as .png, JPG as .png on a PNG route, PNG bytes as .csv, CSV as .json) → alert by policy |
| `corrupt` | Truncated file (60 % of a valid one, unclosed CSV quote, cut JSON) → alert, no download |
| `misnamed` | Valid content under a wrong extension/MIME → accepted (content-first policy); output name uses the real output extension |
| `stale-file` | B swapped into the input the instant A's job is sent; discard mark observed; only B's result is downloadable (PDF: B is appended → A+B) |
| `stale-read` | A's read held; B picked; A released; result is B |
| `stale-setting` | After a result, a setting change removes the download at once (auto-converting tools: old Blob URL revoked); a change at job-sent drops that job |
| `retry` | After the corrupt-file error, a valid file works without reload |
| `route-change` | Header link clicked at job-sent; back; no download; B works |
| `consistency` | Download bytes == Blob behind the link; Blob MIME; exact byte count shown; preview SHA-256 == download SHA-256 (data: preview text is the start of / equal to the file) |
| `privacy` | Whole test incl. error path: no non-GET, no body, no other origin, no URL containing the file name or a content marker, no sendBeacon |
| `a11y` | Header nav visible; picker label in viewport; input focusable; error announced (`role=alert`); job started with Enter on the action; status announced; download link in viewport and activated with Enter |
| `static` | Direct GET 200; `<title>`, description, H1 from the catalogue; non-production `noindex`, no canonical; worker loads from `/_next/static/chunks/*.js` |

## Compress Image
`jpeg-in`, `png-alpha-in`, `webp-in` (E) · `exif-3`/`exif-6`/`exif-8` (E, colour-block positions) · `limit-bytes` (U: 99,999 / 100,000 pass,
100,001 fails) · `limit-pass` (E) · `limit-over` (E: exact size and bytes over equal the download; Adjust settings `data-variant=default`,
download `outline` + "anyway"; Adjust focuses the limit) · `keep-size`, `resize-only-allowed`, `alpha-bg`, `webp-out` (E, may be UNSUPPORTED:
webp-encode) · `format-mismatch` (E, encoder forced to return PNG) · `invalidate` (E: format, size, limit) · `input-bytes`,
`pixel-limit-boundary` (U) · `pixel-limit` (E, header-only file) · `input-bytes-over` (R, real 50,000,001-byte file).

## Images to PDF
Order and size are read from the downloaded PDF with pdf-lib ("Same as each image", no margin: page width = px × 0.75 pt).
`single`, `mixed` (JPEG+PNG+WebP), `count-limit` (E: 49+1 ok, 51st refused), `count-limit-boundary`, `total-limit` (U, `pdfAdmission`),
`total-limit-over` (R, 5 × 40,000,000 B then one more), `corrupt-between`, `duplicate-names`, `two-batches`, `keyboard-reorder`
(focus follows the item; falls to the next usable control), `remove-focus`, `page-a4`, `page-letter`, `page-fit`, `exif`, `limit-pass`,
`limit-over` (numbers vs download, preview `data-sha256`), `pixel-limit`.

## Six converters (png-to-jpg, jpg-to-png, png-to-webp, jpg-to-webp, webp-to-png, webp-to-jpg)
`pair` (magic bytes, name, size, representative pixels) · `alpha` for PNG/WebP sources (keep transparency, or fill colour for JPG) ·
`exif` (3/6/8) for JPG sources · `animated` for PNG/WebP sources (warning before converting, first frame kept: APNG red→blue keeps red,
animated WebP blue→red keeps blue) · `pixel-limit` (header-only 9000×6000) · `limit-over` (optional limit; no "switch format" advice) ·
`format-mismatch` for WebP targets. WebP targets may be UNSUPPORTED (webp-encode) on engines without a WebP encoder — Playwright WebKit
has none: the UI must say "WebP is unavailable", disable the action and never offer a `.webp` download.

## CSV → JSON
U: `bom`, `no-bom`, `vietnamese`, `lf`, `crlf`, `quoted-comma`, `escaped-quote`, `newline-in-cell`, `empty-last-column`, `final-newline`,
`strings-kept` (00123, false, 1e3, ""), `proto-key`, `header-empty`, `header-duplicate`, `row-short`, `row-long`, `unclosed-quote`,
`blank-lines` (policy: skipped + counted), `invalid-utf8` (policy: refused), `limits`. E: `full-compare`, `errors-ui`, `preview-truncated`.
R: `input-bytes-over`.

## JSON → CSV
U: `later-keys`, `missing-key`, `null` (empty cell), `boolean`, `number`, `nested` (JSON text), `escape`, `broken-json`, `root-type`,
`item-type`, `empty-array` (policy: refused), `limits`, `formula-raw`, `formula-protected` (numbers never changed), `round-trip`
(strings, one schema), `non-round-trip` (types → strings, null ≡ missing), `bom`. E: `exact-expected` (byte-exact expected text),
`formula-modes`, `errors-ui`, `preview-truncated`. R: `input-bytes-over`.

## Adding a tool
1. Catalogue entry (`TOOLS` + `LIBRARY` card with `path`) and `apps/web/src/app/<slug>/page.tsx`.
2. Contract in `tool-contracts.ts`: inputs, outputs, limits, capabilities, the shared matrix (`common(...)`) and tool cases.
3. Driver in `tests/e2e/drivers.ts` (the shared matrix runs automatically) + tool spec + unit cases, all tagged.
4. `pnpm test:report && pnpm build && pnpm test:e2e && pnpm gate` — the gate lists anything missing as NOT RUN.
A roadmap item stays a `LIBRARY` card without `path` and a `planned` contract; giving it a route or a link without a public contract fails the gate.
