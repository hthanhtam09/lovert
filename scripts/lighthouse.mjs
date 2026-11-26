// Mobile Lighthouse against the LOCAL static export (served like Pages on :4175).
// Usage: pnpm build && pnpm lighthouse   (needs the `lighthouse` devDependency and a Chromium;
// CHROME_PATH defaults to Playwright's Chromium). Results: docs/benchmarks/lighthouse-<page>.json
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const { default: lighthouse } = await import('lighthouse');
const chromeLauncher = await import('chrome-launcher');
const server = spawn(process.execPath, ['scripts/serve-static.mjs', 'apps/web/out', '4175'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const chrome = await chromeLauncher.launch({ chromePath: process.env.CHROME_PATH ?? chromium.executablePath(), chromeFlags: ['--headless=new'] });
mkdirSync('docs/benchmarks', { recursive: true });
try {
  for (const page of ['/', '/compress-image', '/images-to-pdf']) {
    const r = await lighthouse(`http://localhost:4175${page}`, { port: chrome.port, output: 'json', logLevel: 'error' });
    const lhr = r.lhr;
    const summary = {
      page, date: lhr.fetchTime, lighthouse: lhr.lighthouseVersion, formFactor: lhr.configSettings.formFactor, throttling: lhr.configSettings.throttlingMethod,
      scores: Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)])),
      LCP: lhr.audits['largest-contentful-paint'].displayValue, CLS: lhr.audits['cumulative-layout-shift'].displayValue, TBT: lhr.audits['total-blocking-time'].displayValue,
    };
    console.log(JSON.stringify(summary));
    writeFileSync(`docs/benchmarks/lighthouse-${page === '/' ? 'home' : page.slice(1)}.json`, JSON.stringify(summary, null, 2));
  }
} finally {
  await chrome.kill();
  server.kill();
}
