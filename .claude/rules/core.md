---
paths:
  - "packages/core/**"
---
# Core rules (`@lovert/core`)

- Runtime boundary: no React, Next.js, DOM globals, Node filesystem/`node:*`, pdf-lib, PDF.js or vendor SDKs.
  ESLint enforces this (`eslint.config.mjs`). Core must import from Node directly: imports use `.ts` extensions and only
  erasable TypeScript (no enums, no parameter properties) so `node -e "import('./packages/core/src/index.ts')"` works.
- Data: `Uint8Array` and plain objects only. Results use `ConversionResult` with `status: 'ok' | 'over_limit' | 'error'`.
- Units: one policy in `units.ts` (1 KB = 1,000 bytes). Display rounds up. Never compare formatted strings.
- Byte-level verification: `verifyOutput` reads format from magic bytes, compares exact byte length with `<=`,
  and checks dimensions/page counts measured from the final output, not from requested options.
- Codecs are adapters passed in (`searchCandidate({ encode })`). Canvas, pdf-lib, sharp, etc. live in the runtime that runs them.
- Errors: throw `LovertError` with a code from `ErrorCodes`. Add new codes there; UI and future API map codes, not messages.
- Fixtures: generate deterministically (`tests/fixtures/png.ts`, fake encoders). No binary files without a usage right.
  Cover: exactly at limit, one byte over, wrong real format, cancelled job.
