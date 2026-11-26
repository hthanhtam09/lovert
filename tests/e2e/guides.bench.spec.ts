/**
 * @bench Measures the worked examples used in the /blog guides, by driving the real tools.
 * Run: BENCH=1 pnpm exec playwright test tests/e2e/guides.bench.spec.ts --project=chromium
 * Writes docs/benchmarks/guides.json. Numbers in the guides must come from this file.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { photoJpeg } from './helpers';

test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'Guide numbers are measured in desktop Chromium only');
test.describe.configure({ mode: 'serial', timeout: 300_000 });

const out: Record<string, unknown> = {};

async function compress(page: Page, buf: Buffer, opts: { limitKB?: number; resize?: boolean; exact?: [number, number] }) {
  await page.goto('/compress-image');
  await page.getByLabel('Choose an image').setInputFiles({ name: 'sample.jpg', mimeType: 'image/jpeg', buffer: buf });
  await page.getByLabel('JPEG').check();
  if (opts.limitKB) await page.getByLabel('Maximum size').fill(String(opts.limitKB));
  else await page.getByLabel('Keep the file at or under a limit').uncheck();
  if (opts.exact) {
    await page.getByLabel('Exact size').check();
    await page.getByLabel('Width (px)').fill(String(opts.exact[0]));
    await page.getByLabel('Height (px)').fill(String(opts.exact[1]));
  }
  if (opts.resize) await page.getByLabel(/Allow smaller dimensions/).check();
  await page.getByRole('button', { name: 'Compress' }).click();
  await expect(page.getByTestId('after-caption')).toBeVisible({ timeout: 240_000 });
  const download = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]).then(([d]) => d);
  const bytes = readFileSync((await download.path())!).length;
  return {
    inputBytes: buf.length,
    status: (await page.getByRole('heading', { level: 2, name: /^Result/ }).textContent())!.trim(),
    after: (await page.getByTestId('after-caption').textContent())!.trim(),
    outputBytes: bytes,
    checks: await page.getByLabel('Output checks').locator('li').allTextContents(),
  };
}

test('@bench guide 1: photo under 500 KB', async ({ page }) => {
  const photo = await photoJpeg(page, 4032, 3024, 21, 'Sample receipt line: Total 42.50 - check this small text after compressing');
  out.guide1_photo = await compress(page, photo, { limitKB: 500 });
  const big = await photoJpeg(page, 8000, 6000, 22);
  out.guide1_big_noresize = await compress(page, big, { limitKB: 500 });
  out.guide1_big_resize = await compress(page, big, { limitKB: 500, resize: true });
});

test('@bench guide 2: three photos into one PDF under 1 MB', async ({ page }) => {
  const imgs = [];
  for (const [i, name] of ['page-1-cover.jpg', 'page-2-details.jpg', 'page-3-receipt.jpg'].entries())
    imgs.push({ name, mimeType: 'image/jpeg', buffer: await photoJpeg(page, 4032, 3024, 31 + i, `Sample photo ${i + 1} of 3`) });
  const run = async (lowerRes: boolean, order: 'as-added' | 'receipt-first', limitMB = 1) => {
    await page.goto('/images-to-pdf');
    await page.getByLabel('Add images').setInputFiles(imgs);
    if (order === 'receipt-first') {
      await page.getByRole('button', { name: 'Move page-3-receipt.jpg up' }).click();
      await page.getByRole('button', { name: 'Move page-3-receipt.jpg up' }).click();
    }
    await page.getByLabel('Keep the file at or under a limit').check();
    await page.getByLabel('Maximum size').fill(String(limitMB));
    await page.locator('#pdf-unit').selectOption('MB');
    if (lowerRes) await page.getByLabel(/Allow lower image resolution/).check();
    await page.getByRole('button', { name: 'Create PDF' }).click();
    await expect(page.getByTestId('pdf-meta')).toBeVisible({ timeout: 240_000 });
    await expect(page.getByTestId('pdf-pages').locator('canvas')).toHaveCount(3, { timeout: 60_000 });
    const download = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]).then(([d]) => d);
    return {
      inputBytes: imgs.map((i) => i.buffer.length),
      order: await page.getByRole('list', { name: 'Pages in order' }).locator('li').allTextContents(),
      heading: (await page.getByRole('heading', { level: 2, name: /^Your PDF/ }).textContent())!.trim(),
      meta: (await page.getByTestId('pdf-meta').textContent())!.trim(),
      outputBytes: readFileSync((await download.path())!).length,
      checks: await page.getByLabel('Output checks').locator('li').allTextContents(),
    };
  };
  out.guide2_fullres = await run(false, 'receipt-first');
  out.guide2_tight_fullres = await run(false, 'receipt-first', 0.5);
  out.guide2_tight_lowerres = await run(true, 'receipt-first', 0.5);
});

test('@bench guide 3: 400 x 200 px under 50 KB', async ({ page }) => {
  const photo = await photoJpeg(page, 1200, 600, 41);
  out.guide3_original_50kb = await compress(page, photo, { limitKB: 50 });
  out.guide3_exact_nolimit = await compress(page, photo, { exact: [400, 200] });
  out.guide3_exact_50kb = await compress(page, photo, { limitKB: 50, exact: [400, 200] });
});

test.afterAll(async ({ browserName: _b }) => {
  mkdirSync('docs/benchmarks', { recursive: true });
  writeFileSync('docs/benchmarks/guides.json', JSON.stringify({ date: new Date().toISOString(), browser: 'Chromium (Playwright 1.65.1)', ...out }, null, 2));
});
