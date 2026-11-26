import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { jpegHeaderOnly, withExifOrientation } from '../fixtures/exif';
import { noisyPng, solidPng } from '../fixtures/png';
import { asymmetricJpeg, isRed, isWhite, png, watchNetwork, showPane, type Rgb } from './helpers';

test.describe('/images-to-pdf', () => {
  test('reorders by keyboard, previews the exported PDF and downloads the same file', async ({ page }) => {
    const offenders = watchNetwork(page);
    const pdfjsWorker = page.waitForRequest('**/vendor/pdf.worker.min.mjs');
    await page.goto('/images-to-pdf');
    await page.getByLabel('Add images').setInputFiles([
      png('red.png', solidPng(400, 200, [255, 0, 0])),
      png('green.png', solidPng(200, 400, [0, 255, 0])),
      png('blue.png', solidPng(300, 300, [0, 0, 255])),
    ]);
    await expect(page.getByRole('list', { name: 'Pages in order' }).getByRole('listitem')).toHaveCount(3);
    // Keyboard: move blue up twice → order blue, red, green.
    const up = page.getByRole('button', { name: 'Move blue.png up' });
    await up.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Move blue.png up' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('position 1');
    await showPane(page, /Settings|Result/);
    await page.getByRole('button', { name: 'Create PDF' }).click();
    await expect(page.getByTestId('pdf-meta')).toContainText('3 pages', { timeout: 60_000 });
    const canvases = page.getByTestId('pdf-pages').locator('canvas');
    await expect(canvases).toHaveCount(3, { timeout: 30_000 });
    await showPane(page, 'Pages');
    await expect(page.getByText(/Preview of the exported PDF: 3 pages/)).toBeVisible({ timeout: 30_000 });

    // Page colours from the rendered preview prove the order: blue, red, green.
    const colours = await canvases.evaluateAll((els) =>
      (els as HTMLCanvasElement[]).map((c) => {
        const d = c.getContext('2d')!.getImageData(c.width / 2, c.height / 2, 1, 1).data;
        return d[2]! > 200 && d[0]! < 60 ? 'blue' : d[0]! > 200 && d[1]! < 60 ? 'red' : d[1]! > 200 && d[0]! < 60 ? 'green' : `?${d[0]},${d[1]},${d[2]}`;
      }),
    );
    expect(colours).toEqual(['blue', 'red', 'green']);

    await showPane(page, /Settings|Result/);
    const download = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]).then(([d]) => d);
    const bytes = readFileSync((await download.path())!);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(3);
    const [p1, p2, p3] = doc.getPages();
    expect(p1!.getWidth()).toBeLessThan(p1!.getHeight()); // square image → A4 portrait
    expect(p2!.getWidth()).toBeGreaterThan(p2!.getHeight()); // red is landscape
    expect(p3!.getWidth()).toBeLessThan(p3!.getHeight()); // green is portrait
    expect(offenders).toEqual([]);
    expect((await (await pdfjsWorker).response())?.status()).toBe(200);
  });

  test('[images-to-pdf:limit-pass] meets a size limit after serialization, or explains the trade-off', async ({ page }) => {
    await page.goto('/images-to-pdf');
    await page.getByLabel('Add images').setInputFiles([png('a.png', noisyPng(1600, 1200, 1)), png('b.png', noisyPng(1600, 1200, 2))]);
    await showPane(page, /Settings|Result/);
    await page.getByLabel('Keep the file at or under a limit').check();
    await page.getByLabel('Maximum size').fill('60');
    await page.locator('#pdf-unit').selectOption('KB');
    await showPane(page, /Settings|Result/);
    await page.getByRole('button', { name: 'Create PDF' }).click();
    await expect(page.getByText(/Allow lower image resolution/).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Your PDF (over the limit)' })).toBeVisible();
    await page.getByLabel(/Allow lower image resolution/).check();
    await showPane(page, /Settings|Result/);
    await page.getByRole('button', { name: 'Create PDF' }).click();
    await expect(page.getByRole('heading', { name: 'Your PDF', exact: true })).toBeVisible({ timeout: 90_000 });
    const download = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]).then(([d]) => d);
    expect(readFileSync((await download.path())!).length).toBeLessThanOrEqual(60_000);
  });

  test('[images-to-pdf:exif] EXIF-rotated photo appears upright in the PDF (rotated once)', async ({ page }) => {
    await page.goto('/images-to-pdf');
    const jpeg = withExifOrientation(await asymmetricJpeg(page), 6);
    await page.getByLabel('Add images').setInputFiles({ name: 'rotated.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await showPane(page, /Settings|Result/);
    await page.getByLabel('Paper').selectOption('fit');
    await page.getByLabel('Margin').selectOption('0');
    await showPane(page, /Settings|Result/);
    await page.getByRole('button', { name: 'Create PDF' }).click();
    const canvas = page.getByTestId('pdf-pages').locator('canvas');
    await expect(canvas).toHaveCount(1, { timeout: 60_000 });
    await showPane(page, 'Pages');
    await expect(page.getByText(/Preview of the exported PDF: 1 page/)).toBeVisible({ timeout: 30_000 });
    const px = await canvas.evaluate((c: HTMLCanvasElement) => {
      const x = c.getContext('2d')!;
      const at = (fx: number, fy: number) => [...x.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data.slice(0, 3)];
      return { portrait: c.height > c.width, topRight: at(0.92, 0.04), topLeft: at(0.08, 0.04) };
    });
    expect(px.portrait).toBe(true);
    expect(isRed(px.topRight as Rgb)).toBe(true);
    expect(isWhite(px.topLeft as Rgb)).toBe(true);
  });

  test('[images-to-pdf:pixel-limit] refuses an image over 50 MP before decoding', async ({ page }) => {
    await page.goto('/images-to-pdf');
    await page.getByLabel('Add images').setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: jpegHeaderOnly(8200, 6200) });
    await expect(page.locator('main').getByRole('alert')).toContainText('huge.jpg (8200×6200px, over the 50 megapixel');
    await expect(page.getByRole('button', { name: 'Create PDF' })).toBeDisabled();
  });

  test('skips files that are not images', async ({ page }) => {
    await page.goto('/images-to-pdf');
    await page.getByLabel('Add images').setInputFiles([{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }]);
    await expect(page.locator('main').getByRole('alert')).toContainText('notes.txt (not JPG, PNG or WebP)');
  });
});

test('404 page returns 404 and links to tools', async ({ page }) => {
  const res = await page.goto('/does-not-exist');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
});
