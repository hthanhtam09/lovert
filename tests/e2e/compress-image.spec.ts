import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { jpegHeaderOnly, withExifOrientation } from '../fixtures/exif';
import { noisyPng } from '../fixtures/png';
import { asymmetricJpeg, isBlue, isRed, isWhite, png, watchNetwork, type Rgb, showPane } from './helpers';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

test.describe('/compress-image', () => {
  test('[compress-image:limit-pass] hits a 50 KB limit, preview and download are the same bytes, nothing is uploaded', async ({ page }) => {
    const offenders = watchNetwork(page);
    const workerStarted = page.waitForEvent('worker');
    await page.goto('/compress-image');
    await page.getByLabel('Choose an image').setInputFiles(png('photo.png', noisyPng(800, 600, 7)));
    await page.getByLabel('JPEG').check();
    await page.getByLabel('Maximum size').fill('50');
    await page.getByRole('button', { name: 'Compress' }).click();
    await expect(page.getByRole('status')).toContainText('passed all checks', { timeout: 60_000 });
    await expect(page.getByTestId('after-caption')).toContainText('JPEG · 800×600px');

    const download = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]).then(([d]) => d);
    expect(download.suggestedFilename()).toBe('photo.jpg');
    const bytes = readFileSync((await download.path())!);
    expect(bytes.length).toBeLessThanOrEqual(50_000);
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);

    const previewBytes = await page.getByTestId('after-img').evaluate(async (img: HTMLImageElement) => [...new Uint8Array(await (await fetch(img.src)).arrayBuffer())]);
    expect(sha(Uint8Array.from(previewBytes))).toBe(sha(bytes));
    expect(offenders).toEqual([]);
    // The image work ran in a Web Worker loaded from a bundled JS chunk of the export (not a .ts file).
    expect((await workerStarted).url()).toMatch(/\/_next\/static\/chunks\/[^/]+\.js$/);
  });

  test('transparent PNG to JPEG offers a fill colour', async ({ page }) => {
    await page.goto('/compress-image');
    await page.getByLabel('Choose an image').setInputFiles(png('logo.png', noisyPng(300, 200, 3, true)));
    await page.getByLabel('JPEG').check();
    await expect(page.getByLabel(/Fill transparent areas/)).toBeVisible();
    await page.getByRole('button', { name: 'Compress' }).click();
    await expect(page.getByRole('status')).toContainText('passed all checks', { timeout: 60_000 });
  });

  test('PNG that cannot fit reports over limit with a suggestion, not success', async ({ page }) => {
    await page.goto('/compress-image');
    await page.getByLabel('Choose an image').setInputFiles(png('big.png', noisyPng(600, 600, 5)));
    await page.getByLabel('PNG', { exact: true }).check();
    await page.getByLabel('Maximum size').fill('5');
    await page.getByRole('button', { name: 'Compress' }).click();
    await expect(page.getByRole('status')).toContainText('over the limit', { timeout: 60_000 });
    await expect(page.getByText(/Switch the output to JPEG or WebP/)).toBeVisible();
    await expect(page.getByText(/Failed:/)).toBeAttached();
  });

  test('[compress-image:keep-size] respects an exact size', async ({ page }) => {
    await page.goto('/compress-image');
    await page.getByLabel('Choose an image').setInputFiles(png('p.png', noisyPng(640, 480, 9)));
    await page.getByLabel('JPEG').check();
    await page.getByLabel('Exact size').check();
    await page.getByLabel('Width (px)').fill('300');
    await page.getByLabel('Height (px)').fill('200');
    await page.getByRole('button', { name: 'Compress' }).click();
    await expect(page.getByTestId('after-caption')).toContainText('300×200px', { timeout: 60_000 });
    await expect(page.getByText('Dimensions are exactly 300×200px')).toBeVisible();
  });

  test('[compress-image:resize-only-allowed] allows resizing only when asked', async ({ page }) => {
    await page.goto('/compress-image');
    await page.getByLabel('Choose an image').setInputFiles(png('p.png', noisyPng(1600, 1200, 11)));
    await page.getByLabel('JPEG').check();
    await page.getByLabel('Maximum size').fill('15');
    await page.getByRole('button', { name: 'Compress' }).click();
    await expect(page.getByRole('status')).toContainText('over the limit', { timeout: 60_000 });
    await expect(page.getByTestId('after-caption')).toContainText('1600×1200px');
    await page.getByLabel(/Allow smaller dimensions/).check();
    await page.getByRole('button', { name: 'Compress' }).click();
    await expect(page.getByRole('status')).toContainText('passed all checks', { timeout: 60_000 });
    await expect(page.getByTestId('after-caption')).not.toContainText('1600×1200px');
  });

  test('rejects empty, wrong-type and damaged files', async ({ page }) => {
    await page.goto('/compress-image');
    const input = page.getByLabel('Choose an image');
    await input.setInputFiles({ name: 'e.png', mimeType: 'image/png', buffer: Buffer.alloc(0) });
    await expect(page.locator('main').getByRole('alert')).toContainText('empty');
    await input.setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('hello, not an image') });
    await expect(page.locator('main').getByRole('alert')).toContainText('not a JPG, PNG or WebP');
    // Damaged/cut-off files are refused when picked (whole-file structure check), before any decode.
    const broken = Buffer.concat([noisyPng(50, 50).subarray(0, 40), Buffer.alloc(100, 7)]);
    await input.setInputFiles(png('broken.png', broken));
    await expect(page.locator('main').getByRole('alert')).toContainText(/This PNG is (damaged|incomplete)/);
    await expect(page.getByRole('button', { name: 'Compress' })).toBeDisabled();
  });

  test('changing the file mid-job discards the old result', async ({ page }, info) => {
    await page.goto('/compress-image');
    const input = page.getByLabel('Choose an image');
    await input.setInputFiles(png('a.png', noisyPng(2400, 1800, 1)));
    await page.getByLabel('JPEG').check();
    // Tiny limit + resizing allowed → many candidates; the switch happens right after the job reaches the worker.
    await page.getByLabel('Maximum size').fill('1');
    await page.getByLabel(/Allow smaller dimensions/).check();
    // Deterministic switch: the moment the job is handed to the worker, the page itself swaps in b.png
    // (a test-installed PerformanceObserver), independent of Playwright round-trip latency.
    await page.evaluate((bytes) => {
      const file = new File([new Uint8Array(bytes)], 'b.png', { type: 'image/png' });
      new PerformanceObserver((list, obs) => {
        if (!list.getEntriesByName('lovert:job-sent').length) return;
        obs.disconnect();
        const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }).observe({ type: 'mark' });
    }, [...noisyPng(200, 100, 2)]);
    await page.getByRole('button', { name: 'Compress' }).click();
    const marks = (n: string) => page.evaluate((m) => performance.getEntriesByName(m).length, n);
    await showPane(page, 'Preview');
    await expect(page.getByText('Selected: b.png', { exact: false })).toBeVisible({ timeout: 20_000 });
    // Discarded: the UI stops waiting at once. Stopped: the worker ends the old job at its next candidate.
    await expect.poll(() => marks('lovert:job-discarded'), { timeout: 5_000 }).toBeGreaterThan(0);
    await expect.poll(async () => (await marks('lovert:job-stopped')) + (await marks('lovert:job-late-result')), { timeout: 30_000 }).toBeGreaterThan(0);
    info.annotations.push({ type: 'old-job', description: (await marks('lovert:job-stopped')) ? 'stopped early by the worker' : 'finished before the stop arrived; result dropped' });
    await expect(page.getByTestId('after-caption')).toHaveCount(0);
    // The user can start again right away.
    await showPane(page, /Settings|Result/);
    await page.getByLabel('JPEG').check();
    await page.getByLabel(/Allow smaller dimensions/).uncheck();
    await page.getByLabel('Maximum size').fill('50');
    await page.getByRole('button', { name: 'Compress' }).click();
    await expect(page.getByTestId('after-caption')).toContainText('200×100px', { timeout: 60_000 });
  });

  test('[compress-image:webp-out] WebP option follows the probed encoder; output bytes are real WebP; preview == download', async ({ page }, info) => {
    const offenders = watchNetwork(page);
    await page.goto('/compress-image');
    const webp = page.getByLabel('WebP');
    // Wait for the probe (runs a 4×4 sample through the same worker encoder path).
    await expect.poll(async () => (await webp.isDisabled()) || (await page.locator('#ci-webp-note').count()) === 0, { timeout: 10_000 }).toBe(true);
    await page.waitForTimeout(500);
    const disabled = await webp.isDisabled();
    info.annotations.push({ type: 'webp-encoder', description: disabled ? 'unavailable (probe returned non-WebP bytes)' : 'available' });
    await page.getByLabel('Choose an image').setInputFiles(png('w.png', noisyPng(400, 300, 4)));
    if (disabled) {
      await expect(page.locator('#ci-webp-note')).toContainText('WebP is unavailable');
      info.annotations.push({ type: 'unsupported', description: 'webp-encode: encoder probe returned non-WebP bytes; WebP option disabled with a note, JPEG still works' });
      await expect(page.getByLabel('JPEG')).toBeEnabled();
      await page.getByLabel('JPEG').check();
      await page.getByRole('button', { name: 'Compress' }).click();
      await expect(page.getByTestId('after-caption')).toContainText('JPEG', { timeout: 60_000 });
      return;
    }
    await webp.check();
    await page.getByRole('button', { name: 'Compress' }).click();
    await expect(page.getByTestId('after-caption')).toContainText('WebP', { timeout: 60_000 });
    const download = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]).then(([d]) => d);
    expect(download.suggestedFilename()).toBe('w.webp');
    const bytes = readFileSync((await download.path())!);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
    const previewBytes = await page.getByTestId('after-img').evaluate(async (img: HTMLImageElement) => [...new Uint8Array(await (await fetch(img.src)).arrayBuffer())]);
    expect(sha(Uint8Array.from(previewBytes))).toBe(sha(bytes));
    expect(offenders).toEqual([]);
  });

  test('EXIF Orientation 6 is applied exactly once', async ({ page }) => {
    await page.goto('/compress-image');
    const jpeg = withExifOrientation(await asymmetricJpeg(page), 6);
    await page.getByLabel('Choose an image').setInputFiles({ name: 'rotated.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await page.getByLabel('JPEG').check();
    await page.getByLabel('Keep the file at or under a limit').uncheck();
    await page.getByRole('button', { name: 'Compress' }).click();
    await expect(page.getByTestId('after-caption')).toContainText('120×240px', { timeout: 60_000 });
    const px = await page.getByTestId('after-img').evaluate(async (img: HTMLImageElement) => {
      const bmp = await createImageBitmap(await (await fetch(img.src)).blob());
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const x = c.getContext('2d')!;
      x.drawImage(bmp, 0, 0);
      const at = (a: number, b: number) => [...x.getImageData(a, b, 1, 1).data.slice(0, 3)];
      return { size: [bmp.width, bmp.height], topRight: at(110, 10), topLeft: at(10, 10), bottomLeft: at(10, 230), bottomRight: at(110, 230) };
    });
    expect(px.size).toEqual([120, 240]);
    expect(isRed(px.topRight as Rgb)).toBe(true);
    expect(isWhite(px.topLeft as Rgb)).toBe(true);
    // Stored bottom-right blue block → displayed bottom-left after a single 90° CW rotation.
    expect(isBlue(px.bottomLeft as Rgb)).toBe(true);
    expect(isWhite(px.bottomRight as Rgb)).toBe(true);
  });

  test('[compress-image:pixel-limit] refuses an image over 50 MP from its header, then keeps working', async ({ page }) => {
    await page.goto('/compress-image');
    const input = page.getByLabel('Choose an image');
    const t0 = Date.now();
    await input.setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: jpegHeaderOnly(8200, 6200) });
    await expect(page.locator('main').getByRole('alert')).toContainText('8200×6200px (50.8 MP)');
    // Header-only file: if it had been decoded we would see DECODE_FAILED instead.
    expect(Date.now() - t0).toBeLessThan(5000);
    await expect(page.getByRole('button', { name: 'Compress' })).toBeDisabled();
    await input.setInputFiles({ name: 'wide.jpg', mimeType: 'image/jpeg', buffer: jpegHeaderOnly(17000, 100) });
    await expect(page.locator('main').getByRole('alert')).toContainText('17000×100px');
    await input.setInputFiles(png('ok.png', noisyPng(200, 150, 3)));
    await page.getByLabel('JPEG').check();
    await page.getByRole('button', { name: 'Compress' }).click();
    await expect(page.getByTestId('after-caption')).toContainText('200×150px', { timeout: 60_000 });
  });

  test('page content is readable without JavaScript', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/compress-image');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Compress an image to a target file size');
    await expect(page.getByText('How do I compress an image to a specific size')).toBeVisible();
    await ctx.close();
  });
});
