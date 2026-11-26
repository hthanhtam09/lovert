import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { compressOutcome, expect, fx, isDesktop, pdfOutcome, QA, setLimit, test } from './qa-helpers';

// Method: fresh page per run, wall clock from the click on the action button to the result/alert being visible
// (Playwright polling granularity ≈ tens of ms). Includes reading the file, worker transfer, encode, verification and render.
// Results are appended as JSON lines to qa-results/two-tools/perf.jsonl.
const RUNS = { small: 5, normal: 5, large: 3 };
const record = (row: object) => {
  mkdirSync(QA, { recursive: true });
  appendFileSync(join(QA, 'perf.jsonl'), JSON.stringify(row) + '\n');
};

test.describe('perf', () => {
  test.skip(({ isMobile }) => isMobile, 'timing on desktop engines only');

  const compressCases = [
    { size: 'small', file: 'small.jpg', limit: '100', unit: 'KB' as const, note: '64×48 JPEG, default 100 KB' },
    { size: 'normal', file: 'portrait.jpg', limit: '100', unit: 'KB' as const, note: '1200×1800 JPEG → ≤100 KB' },
    { size: 'large', file: 'limit-48mp.jpg', limit: '2', unit: 'MB' as const, note: '8000×6000 JPEG → ≤2 MB' },
  ];
  for (const c of compressCases)
    test(`T-compress-${c.size} @perf`, async ({ page }, info) => {
      test.skip(!isDesktop(info.project.name));
      const times: number[] = [];
      let status = '';
      for (let i = 0; i < RUNS[c.size as keyof typeof RUNS]; i++) {
        await page.goto('/compress-image');
        await page.getByLabel('Choose an image').setInputFiles(fx(c.file));
        await setLimit(page, c.limit, c.unit);
        const t0 = Date.now();
        await page.getByRole('button', { name: 'Compress' }).click();
        await compressOutcome(page, 170_000);
        times.push(Date.now() - t0);
        status = (await page.getByRole('status').textContent()) ?? '';
      }
      expect(times.length).toBeGreaterThan(0);
      record({ tool: 'compress-image', browser: info.project.name, case: c.size, input: c.note, runs: times.length, ms: times, median: [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)], lastStatus: status.trim() });
    });

  const pdfCases = [
    { size: 'small', files: ['small.jpg'], note: '1 × 64×48' },
    { size: 'normal', files: ['pages/page-1.jpg', 'pages/page-2.png', 'pages/page-3.webp', 'pages/page-4.jpg', 'pages/page-5.png'], note: '5 pages ≈0.8 MP each, no limit' },
    { size: 'large', files: ['limit-48mp.jpg', 'limit-50mp-exact.jpg', 'panorama.jpg'], note: '48 MP + 50 MP + 6 MP, no limit' },
  ];
  for (const c of pdfCases)
    test(`T-pdf-${c.size} @perf`, async ({ page }, info) => {
      test.skip(!isDesktop(info.project.name));
      const times: number[] = [];
      for (let i = 0; i < RUNS[c.size as keyof typeof RUNS]; i++) {
        await page.goto('/images-to-pdf');
        await page.getByLabel('Add images').setInputFiles(c.files.map(fx));
        const t0 = Date.now();
        await page.getByRole('button', { name: 'Create PDF' }).click();
        await pdfOutcome(page);
        times.push(Date.now() - t0);
      }
      record({ tool: 'images-to-pdf', browser: info.project.name, case: c.size, input: c.note, runs: times.length, ms: times, median: [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] });
    });
});
