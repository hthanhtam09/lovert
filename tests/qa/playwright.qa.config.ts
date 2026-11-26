import { defineConfig, devices } from '@playwright/test';

// QA round for /compress-image and /images-to-pdf against the static export (apps/web/out), served like Cloudflare Pages.
// Prereq: `pnpm build && node tests/qa/make-fixtures.mjs`. Run: `pnpm exec playwright test -c tests/qa/playwright.qa.config.ts --grep-invert @perf` (timing: `--grep @perf --workers=1`).
// Everything it writes goes under qa-results/two-tools/ (git-ignored).
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.qa\.spec\.ts/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 4,
  fullyParallel: true,
  retries: 0,
  outputDir: '../../qa-results/two-tools/pw-artifacts',
  reporter: [['list'], ['json', { outputFile: '../../qa-results/two-tools/results.json' }]],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure', acceptDownloads: true },
  webServer: { command: 'node scripts/serve-static.mjs apps/web/out 4173', cwd: '../..', url: 'http://localhost:4173', reuseExistingServer: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
