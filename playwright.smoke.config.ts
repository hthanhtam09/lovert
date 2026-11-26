import { defineConfig, devices } from '@playwright/test';

// Smoke test against a deployed URL (Cloudflare Pages Preview or production).
//   SMOKE_URL=https://<sha>.lovert.pages.dev EXPECT_ORIGIN=https://lovert.example SMOKE_KIND=preview pnpm smoke
// Without SMOKE_URL it serves the local export on :4174 (a local stand-in, NOT a Preview deployment).
const url = process.env.SMOKE_URL;
export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 120_000,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'reports/smoke.json' }]],
  outputDir: 'test-results/smoke',
  use: { baseURL: url ?? 'http://localhost:4174', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: url ? undefined : { command: 'node scripts/serve-static.mjs apps/web/out 4174', url: 'http://localhost:4174', reuseExistingServer: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
