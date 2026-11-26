---
paths:
  - "apps/web/src/app/**"
  - "apps/web/src/components/**"
  - "apps/web/src/content/tools.ts"
  - "apps/web/src/lib/**"
  - "packages/core/src/**"
  - "tests/**"
  - "scripts/tool-gate*.mjs"
  - "playwright.config.ts"
  - ".github/workflows/**"
---
# Tool gate rules

- Every public tool (route folder in `apps/web/src/app` that is not an info page, `TOOLS` entry, `LIBRARY` card with `path`) has a public
  contract in `tests/contracts/tool-contracts.ts`: inputs, outputs, limits, browser capabilities and required cases.
  `node scripts/tool-gate.mjs --registry-only` enforces it; changing a catalogue status or removing an entry cannot hide a real route.
- A new tool lands in one change with: route + catalogue entry, contract, valid and invalid fixtures (generators in `tests/fixtures/`),
  unit/integration tests for new logic, E2E through the real UI that checks the downloaded file itself, and a driver in
  `tests/e2e/drivers.ts` so the shared matrix covers it. Tools on a shared pipeline use parameterised tests, but each route keeps its own
  cases, fixtures and assertions.
- A case counts only when a test tagged `[slug:case]` ran and passed on every project in `tests/contracts/projects.ts`
  (chromium, firefox, webkit, mobile-chromium, mobile-webkit). Declaring it in the contract or naming a spec is not enough.
- Any failed, flaky or skipped test fails the gate unless listed in `tests/contracts/exceptions.ts` with slug, case, project, status and reason.
- `UNSUPPORTED` is valid only for a capability the case declares, detected at runtime (never from the browser name), with a reason and a
  passing test that verified the UI handling (e.g. no WebP encoder → clear message, action disabled, nothing downloads as `.webp`).
  A required case that did not run is `NOT RUN` and blocks.
- Roadmap items have no route and no link; their contract is `planned`. Ship = make it public with the full contract.
- Races are driven by events (`onJobSent`, held reads), not fixed sleeps. Failures keep slug, project, fixture and assertion in the
  title/trace (`test-results/`, `reports/`).
- QA workflow and case catalogue: `.claude/skills/lovert-tool-qa/`.
