import { defineConfig, devices } from '@playwright/test';
import { REQUIRED_PROJECTS } from './tests/contracts/projects';

// Runs against the static export served like Cloudflare Pages. Build first: `pnpm build`.
// Merge suite: everything except @bench and @release. Release suite (large files, repeated races): `pnpm test:e2e:release`.
// The JSON report feeds the tool gate (scripts/tool-gate.mjs); traces/screenshots of failures stay in test-results/.
const RELEASE = !!process.env.RELEASE;

// Firefox opens some downloads (images, JSON, PDF) in an internal viewer instead of saving them, so Playwright never
// sees a download event (docs/qa/two-tools-report.md §6). Make it save every download, like a user who chose "Save".
const firefoxPrefs = {
  'browser.download.viewableInternally.enabledTypes': '',
  'browser.download.open_pdf_attachments_inline': false,
  'pdfjs.disabled': true,
  'devtools.jsonview.enabled': false,
  'browser.download.always_ask_before_handling_new_types': false,
};

const projects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'], launchOptions: { firefoxUserPrefs: firefoxPrefs } } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
];
if (projects.map((p) => p.name).join() !== REQUIRED_PROJECTS.join()) throw new Error('playwright projects must match tests/contracts/projects.ts');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: true,
  grep: RELEASE ? /@release/ : undefined,
  grepInvert: process.env.BENCH ? undefined : RELEASE ? /@bench/ : /@bench|@release/,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    [process.env.CI ? 'github' : 'list'],
    // E2E_REPORT lets CI shards write one report per project (merged by the tool gate).
    ['json', { outputFile: process.env.E2E_REPORT ?? (RELEASE ? 'reports/e2e-release.json' : 'reports/e2e.json') }],
    ['html', { outputFolder: 'reports/e2e-html', open: 'never' }],
  ],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/serve-static.mjs apps/web/out 4173', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI },
  projects,
});
