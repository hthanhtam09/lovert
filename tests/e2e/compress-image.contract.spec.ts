/** Compress Image: tool-specific contract cases (the shared matrix is in tool-common.spec.ts). */
import { expect, test, type Page } from '@playwright/test';
import { withExifOrientation } from '../fixtures/exif';
import { alphaWebp, asymJpeg } from '../fixtures/encoded';
import { noisyPng } from '../fixtures/png';
import { alerts, decodePixels, downloadVia, near, pane, type Payload } from './gate-helpers';

const T = (c: string) => `[compress-image:${c}]`;
const RED: [number, number, number] = [255, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];
const BLUE: [number, number, number] = [0, 0, 255];

async function choose(page: Page, file: Payload) {
  await page.getByLabel('Choose an image').setInputFiles(file);
  await expect(page.getByText(`Selected: ${file.name}`, { exact: false })).toBeAttached({ timeout: 30_000 });
}
async function compress(page: Page, o: { format?: 'JPEG' | 'PNG' | 'WebP'; limitKB?: string | null } = {}) {
  await pane(page, /Settings|Result/);
  if (o.format) await page.getByLabel(o.format, { exact: true }).check();
  if (o.limitKB === null) await page.getByLabel('Keep the file at or under a limit').uncheck();
  else if (o.limitKB) await page.getByLabel('Maximum size').fill(o.limitKB);
  await page.getByRole('button', { name: 'Compress', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/passed all checks|over the limit/, { timeout: 60_000 });
}
const dl = (page: Page) => downloadVia(page, page.getByTestId('download'));

test.beforeEach(async ({ page }) => {
  await page.goto('/compress-image');
});

test(`${T('jpeg-in')} JPEG input compresses to a verified JPEG`, async ({ page }) => {
  await choose(page, { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: asymJpeg });
  await compress(page, { format: 'JPEG', limitKB: '50' });
  const out = await dl(page);
  expect(out.name).toBe('photo.jpg');
  expect([...out.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  const d = await decodePixels(page, out.bytes, 'image/jpeg', [[0.1, 0.1], [0.5, 0.5]]);
  expect([d.width, d.height]).toEqual([240, 120]);
  expect(near(d.px[0]!, RED)).toBe(true);
  expect(near(d.px[1]!, WHITE)).toBe(true);
});

test(`${T('png-alpha-in')} PNG with alpha to PNG keeps transparency`, async ({ page }) => {
  await choose(page, { name: 'logo.png', mimeType: 'image/png', buffer: noisyPng(200, 100, 3, true) });
  await compress(page, { format: 'PNG', limitKB: null });
  const out = await dl(page);
  const d = await decodePixels(page, out.bytes, 'image/png', [[0.1, 0.5], [0.8, 0.5]]);
  expect(d.px[0]![3]).toBe(0); // left quarter transparent
  expect(d.px[1]![3]).toBe(255);
});

test(`${T('webp-in')} WebP input is decoded and compressed`, async ({ page }) => {
  await choose(page, { name: 'logo.webp', mimeType: 'image/webp', buffer: alphaWebp });
  await compress(page, { format: 'PNG', limitKB: null });
  const out = await dl(page);
  const d = await decodePixels(page, out.bytes, 'image/png', [[0.25, 0.5], [0.75, 0.5]]);
  expect([d.width, d.height]).toEqual([200, 100]);
  expect(d.px[0]![3]).toBeLessThan(10);
  expect(near(d.px[1]!, RED)).toBe(true);
});

// Stored 240×120: red block top-left, blue block bottom-right. Expected displayed size and positions per orientation.
const EXIF = {
  3: { size: [240, 120], red: [0.9, 0.85], blue: [0.05, 0.05], white: [0.1, 0.9] },
  6: { size: [120, 240], red: [0.9, 0.1], blue: [0.05, 0.92], white: [0.1, 0.1] },
  8: { size: [120, 240], red: [0.1, 0.9], blue: [0.92, 0.05], white: [0.9, 0.9] },
} as const;
for (const o of [3, 6, 8] as const) {
  test(`${T(`exif-${o}`)} EXIF orientation ${o} applied exactly once (colour positions)`, async ({ page }) => {
    await choose(page, { name: `rot${o}.jpg`, mimeType: 'image/jpeg', buffer: withExifOrientation(asymJpeg, o) });
    await compress(page, { format: 'PNG', limitKB: null });
    const out = await dl(page);
    const e = EXIF[o];
    const d = await decodePixels(page, out.bytes, 'image/png', [e.red as [number, number], e.blue as [number, number], e.white as [number, number]]);
    expect([d.width, d.height]).toEqual(e.size);
    expect(near(d.px[0]!, RED), 'red block position').toBe(true);
    expect(near(d.px[1]!, BLUE), 'blue block position').toBe(true);
    expect(near(d.px[2]!, WHITE), 'background').toBe(true);
  });
}

test(`${T('limit-over')} over the limit: size and bytes over match the download; Adjust settings is the primary CTA`, async ({ page }) => {
  await choose(page, { name: 'big.png', mimeType: 'image/png', buffer: noisyPng(600, 600, 5) });
  await compress(page, { format: 'PNG', limitKB: '5' });
  const note = page.getByTestId('over-limit');
  await expect(note).toBeVisible();
  const out = await dl(page);
  await expect(note).toContainText(`Smallest file: ${out.bytes.length.toLocaleString('en-US')} bytes, limit 5,000 bytes`);
  await expect(note).toContainText(`${(out.bytes.length - 5_000).toLocaleString('en-US')} bytes over`);
  await expect(page.getByText(`${out.bytes.length.toLocaleString('en-US')} bytes > limit 5,000 bytes`)).toBeVisible();
  const adjust = page.getByRole('button', { name: 'Adjust settings' });
  await expect(adjust).toBeVisible();
  await expect(adjust).toHaveAttribute('data-variant', 'default');
  await expect(page.getByTestId('download')).toContainText('anyway');
  await expect(page.getByTestId('download')).toHaveAttribute('data-variant', 'outline');
  await adjust.click();
  await expect(page.getByLabel('Maximum size')).toBeFocused();
});

test(`${T('alpha-bg')} PNG alpha to JPEG uses the chosen fill colour`, async ({ page }) => {
  await choose(page, { name: 'logo.png', mimeType: 'image/png', buffer: noisyPng(200, 100, 3, true) });
  await pane(page, /Settings|Result/);
  await page.getByLabel('JPEG', { exact: true }).check();
  await page.locator('#ci-bg').fill('#00ff00');
  await compress(page, { limitKB: null });
  const out = await dl(page);
  const d = await decodePixels(page, out.bytes, 'image/jpeg', [[0.1, 0.5]]);
  expect(near(d.px[0]!, [0, 255, 0])).toBe(true);
  expect(d.px[0]![3]).toBe(255);
});

test(`${T('format-mismatch')} browser returns PNG for WebP: option disabled with a note, no .webp download`, async ({ page }) => {
  // Main-thread path (no Worker) with a canvas encoder that answers WebP requests with PNG, like engines without WebP encoding.
  await page.addInitScript(() => {
    // @ts-expect-error test override
    delete window.Worker;
    for (const C of [OffscreenCanvas, HTMLCanvasElement] as const) {
      if (C === OffscreenCanvas) {
        const orig = OffscreenCanvas.prototype.convertToBlob;
        OffscreenCanvas.prototype.convertToBlob = function (o?: ImageEncodeOptions) {
          return orig.call(this, o?.type === 'image/webp' ? { ...o, type: 'image/png' } : o);
        };
      } else {
        const orig = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, type?: string, q?: unknown) {
          return orig.call(this, cb, type === 'image/webp' ? 'image/png' : type, q);
        };
      }
    }
  });
  await page.reload();
  await choose(page, { name: 'photo.png', mimeType: 'image/png', buffer: noisyPng(120, 80, 2) });
  await pane(page, /Settings|Result/);
  await expect(page.getByLabel('WebP', { exact: true })).toBeDisabled();
  await expect(page.locator('#ci-webp-note')).toContainText('WebP is unavailable');
  await compress(page, { format: 'JPEG', limitKB: null });
  const out = await dl(page);
  expect(out.name.endsWith('.webp')).toBe(false);
  expect([...out.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
});

test(`${T('invalidate')} changing format, size or limit clears the old result immediately`, async ({ page }) => {
  await choose(page, { name: 'p.png', mimeType: 'image/png', buffer: noisyPng(240, 160, 4) });
  const changes: [string, (p: Page) => Promise<void>][] = [
    ['format', (p) => p.getByLabel('WebP', { exact: true }).isDisabled().then((dis) => p.getByLabel(dis ? 'PNG' : 'WebP', { exact: true }).check())],
    ['size', (p) => p.getByLabel('Exact size').check()],
    ['limit', (p) => p.getByLabel('Maximum size').fill('70')],
  ];
  for (const [name, change] of changes) {
    await pane(page, /Settings|Result/);
    await page.getByLabel('Keep original').check(); // the previous round may have left "Exact size" on
    await compress(page, { format: 'JPEG', limitKB: '80' });
    await expect(page.getByTestId('download')).toHaveCount(1);
    await expect(page.getByTestId('after-caption')).toHaveCount(1);
    await change(page);
    await expect(page.getByTestId('download'), `${name} change clears the download`).toHaveCount(0);
    await expect(page.getByTestId('after-caption'), `${name} change clears the preview`).toHaveCount(0);
  }
});

test(`${T('input-bytes-over')} @release a real 50,000,001-byte file is refused before decoding`, async ({ page }) => {
  test.setTimeout(300_000);
  const png = noisyPng(16, 16, 1);
  const iend = png.subarray(png.length - 12);
  const pad = Buffer.alloc(50_000_001 - png.length);
  pad.writeUInt32BE(pad.length - 12, 0);
  pad.write('teXt', 4, 'latin1');
  await page.getByLabel('Choose an image').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.concat([png.subarray(0, png.length - 12), pad, iend]) });
  await pane(page, /Settings|Result/);
  await expect(alerts(page).filter({ hasText: 'larger than 50 MB' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Compress', exact: true })).toBeDisabled();
});
