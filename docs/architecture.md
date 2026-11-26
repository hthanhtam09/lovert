# Architecture

```
packages/core      @lovert/core — pure TS, no DOM/Node/SDK
  units.ts         1 KB = 1,000 B; display rounds up; size buckets for analytics
  format.ts        magic-byte detection, MIME/extension maps
  validate.ts      empty / type / size / pixel checks       limits.ts  resource limits + rationale
  search.ts        candidate policy (quality binary search, resize only if allowed)
  verify.ts        byte-level checks of the final output     result.ts  ConversionResult union
  layout.ts        PDF page placement (fit, no crop, orientation), list reordering
  job.ts           latest-wins job guard
apps/web           Next.js App Router, output: 'export'
  src/content/tools.ts         catalog → nav, home, pages, sitemap
  src/lib/site-config.ts       SITE_URL / DEPLOY_ENV validation
  src/lib/seo.ts               metadata, JSON-LD helpers
  src/lib/image/surface.ts     canvas adapter (OffscreenCanvas or <canvas>), decode with EXIF orientation
  src/lib/image/compress.ts    compress pipeline = core policy + canvas encoder + verification
  src/lib/pdf/build.ts         pdf-lib assembly; images-to-pdf.ts reuses the image pipeline + core search
  src/lib/convert.worker.ts    Web Worker entry; runner.ts picks worker or main-thread fallback
  src/components/*             tool UIs, PDF.js preview (lazy)
```

## Data flow (compress)
File → `slice(0,16)` magic check → `arrayBuffer` transferred to worker → decode (`createImageBitmap`, `imageOrientation: from-image`)
→ alpha sample on a ≤256px copy → `searchCandidate` (encode via `convertToBlob`) → first candidate's real format checked
(`FORMAT_MISMATCH` if the browser substituted PNG) → output decoded again for dimensions → `verifyOutput` →
`ConversionResult` back (buffer transferred) → one Blob → object URL used by both `<img>` and the download link.

## Data flow (images → PDF)
Validate every image once (metadata only) → for each candidate quality/scale: decode, draw on white, JPEG-encode, `buildPdf`
→ size measured on the serialized PDF → page count re-read with pdf-lib → preview rendered by PDF.js from the same bytes.
Bitmaps are decoded per pass to keep memory bounded (≤ 50 images).

## Build note: worker artifact
Turbopack (Next 16.4.6) emitted `convert.worker.ts` source into `_next/static/media/` as an unreferenced asset
(module defined, never required) next to the real bundled worker. Moving the runner behind dynamic import did not help.
Fix: production build uses webpack (`next build --webpack`), which bundles the worker as a JS chunk and emits no `.ts`.
`check-build.mjs` still warns if any `.ts` appears in the export. Dev (`next dev`) still uses Turbopack.

## Cancellation
Changing the file discards the old result in the UI immediately and sends `cancel` to the worker; the worker stops the
old job at the next candidate boundary. An encode already in progress finishes first. If the old job finishes
before the stop arrives, its result is dropped. The main-thread fallback only discards; it cannot stop.

## Supabase (later, not in v1)
Add only when a feature needs accounts or saved data (e.g. API keys, usage history).
- Client: publishable key only. Server: secret key only in server env, never in the repo or client bundle.
- Every user-owned table has RLS enabled with `owner_id = auth.uid()` policies for select/insert/update/delete.
- Migrations in `supabase/migrations`, with tests that a second user cannot read or write the first user's rows
  and that anon cannot read owner data.
- No file content stored by default; if needed, private buckets with TTL cleanup.
