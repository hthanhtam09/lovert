---
paths:
  - "apps/web/**"
  - "tests/e2e/**"
---
# Web rules (`apps/web`)

- Heavy work runs in `src/lib/convert.worker.ts` via `src/lib/runner.ts`. Keep the `new Worker(new URL('./convert.worker.ts', import.meta.url))`
  form. Production builds use webpack (`next build --webpack`): Turbopack 16.4 also copied the worker's `.ts` source into the export.
  Load `runner.ts` only with dynamic `import()` from event handlers/effects. Fallback to main thread when Worker/OffscreenCanvas/createImageBitmap are missing; show a clear
  message when canvas itself is missing. After build changes, check the worker loads from the export (`pnpm test:e2e`).
- PDF.js worker is copied to `public/vendor/` by `scripts/copy-pdf-worker.mjs`; PDF.js and pdf-lib are lazy-loaded.
  Give PDF.js a copy of the bytes (it may detach the buffer).
- Latest job wins: use `createJobGuard`; changing files or options clears the old result (discard) and calls `cancelRunnerJobs()`
  from `src/lib/runner-client.ts` (synchronous; never `loadRunner().then(cancelJobs)`, which can cancel the next job)
  (the worker stops at the next candidate; an in-flight encode can't be aborted). Re-check the guard before sending a job.
- Output formats: offer only what `encoderSupport()` verified from real output bytes; keep final-byte format verification.
- Object URLs: create through `useObjectUrl()`, which revokes on replace/unmount. Don't keep extra copies of buffers;
  transfer `ArrayBuffer`s to the worker.
- Preview and download must use the same final bytes.
- Accessibility: native file input next to drag-and-drop; `role="status"` for progress, `role="alert"` for errors;
  every action reachable by keyboard (reorder with buttons, not drag only); 44px touch targets; mobile first.
- Privacy: no uploads in v1 tools. Analytics only via `src/lib/analytics.ts` (opt-in, fixed events, slug/code/size bucket).
  `download_clicked` does not mean another site accepted the file.
- Never write "on your device", "not uploaded" or "browser-only" for any feature that sends data to a server.
- UI primitives come from shadcn/ui in `src/components/ui/` (Button, Input, Label, Checkbox, RadioGroup, NativeSelect, Card, Badge).
  Add new ones with `pnpm --filter @lovert/web exec shadcn add <name>`, then check the generated `cn` import points to `@/lib/utils`.
  Do not hand-roll buttons or form controls. Theme colours are the shadcn tokens in `src/app/globals.css`; primary buttons use
  `--primary-foreground` (white). Keep app-level CSS inside `@layer base` so Tailwind utilities always win.
- Use `NativeSelect` (not the Radix Select) so selects stay native, keyboard/mobile friendly and testable with `selectOption`.
