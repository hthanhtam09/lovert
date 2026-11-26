/**
 * Images to PDF: tool-specific contract cases. Page order is read from the downloaded PDF itself:
 * in "Same as each image" mode with no margin each page is the image size at 96 DPI (width px × 0.75 pt),
 * so fixtures with distinct widths identify every page.
 */
import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { alphaWebp, asymJpeg } from '../fixtures/encoded';
import { noisyPng, solidPng } from '../fixtures/png';
import { alerts, downloadVia, pane, sha, type Payload } from './gate-helpers';

const T = (c: string) => `[images-to-pdf:${c}]`;
const png = (name: string, w: number, h = 64): Payload => ({ name, mimeType: 'image/png', buffer: solidPng(w, h, [w % 256, 80, 160]) });
const add = (page: Page, files: Payload[]) => page.getByLabel('Add images').setInputFiles(files);
/** Page list items, counted even while the list pane is hidden on narrow screens (role queries skip hidden elements). */
const list = (page: Page) => page.locator('ol[aria-label="Pages in order"] > li');

async function settings(page: Page, paper: 'a4' | 'letter' | 'fit', margin = '0') {
  await pane(page, /Settings|Result/);
  await page.getByLabel('Paper').selectOption(paper);
  await page.getByLabel('Margin').selectOption(margin);
}
async function create(page: Page) {
  await pane(page, /Settings|Result/);
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByTestId('pdf-meta')).toContainText('page', { timeout: 60_000 });
  const out = await downloadVia(page, page.getByTestId('download'));
  expect(out.name).toBe('images.pdf');
  return { ...out, doc: await PDFDocument.load(out.bytes, { updateMetadata: false }) };
}
/** Page widths in px at 96 DPI (fit mode, no margin). */
const widthsPx = (doc: PDFDocument) => doc.getPages().map((p) => Math.round(p.getWidth() / 0.75));

test.beforeEach(async ({ page }) => {
  await page.goto('/images-to-pdf');
});

test(`${T('single')} one image gives one page`, async ({ page }) => {
  await add(page, [png('one.png', 96)]);
  await settings(page, 'fit');
  const { doc } = await create(page);
  expect(doc.getPageCount()).toBe(1);
  expect(widthsPx(doc)).toEqual([96]);
});

test(`${T('mixed')} JPEG, PNG and WebP in one PDF, in order`, async ({ page }) => {
  await add(page, [
    { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: asymJpeg }, // 240×120
    png('mid.png', 128),
    { name: 'logo.webp', mimeType: 'image/webp', buffer: alphaWebp }, // 200×100
  ]);
  await settings(page, 'fit');
  const { doc } = await create(page);
  expect(widthsPx(doc)).toEqual([240, 128, 200]);
});

test(`${T('count-limit')} 50 images accepted, the 51st refused`, async ({ page }) => {
  test.setTimeout(180_000);
  const files = Array.from({ length: 51 }, (_, i) => png(`p${String(i + 1).padStart(2, '0')}.png`, 8 + i, 8));
  await add(page, files.slice(0, 49));
  await expect(list(page)).toHaveCount(49);
  await pane(page, 'Pages');
  await add(page, files.slice(49));
  await expect(list(page)).toHaveCount(50);
  await pane(page, /Settings|Result/);
  await expect(alerts(page).filter({ hasText: 'p51.png (over 50 images)' })).toBeVisible();
  await settings(page, 'fit');
  const { doc } = await create(page);
  expect(doc.getPageCount()).toBe(50);
  expect(widthsPx(doc)).toEqual(Array.from({ length: 50 }, (_, i) => 8 + i));
});

test(`${T('corrupt-between')} a damaged file between good ones is skipped; order kept`, async ({ page }) => {
  const bad = noisyPng(60, 40, 3);
  await add(page, [png('first.png', 96), { name: 'broken.png', mimeType: 'image/png', buffer: bad.subarray(0, bad.length - 30) }, png('last.png', 160)]);
  await pane(page, /Settings|Result/);
  await expect(alerts(page).filter({ hasText: 'broken.png (damaged or incomplete PNG)' })).toBeVisible();
  await expect(list(page)).toHaveCount(2);
  await settings(page, 'fit');
  expect(widthsPx((await create(page)).doc)).toEqual([96, 160]);
});

test(`${T('duplicate-names')} two files with the same name are both kept, in order`, async ({ page }) => {
  await add(page, [png('scan.png', 96)]);
  await pane(page, 'Pages');
  await add(page, [png('scan.png', 160)]);
  await expect(list(page)).toHaveCount(2);
  await expect(list(page).filter({ hasText: 'scan.png' })).toHaveCount(2);
  await settings(page, 'fit');
  expect(widthsPx((await create(page)).doc)).toEqual([96, 160]);
});

test(`${T('two-batches')} two add batches keep their order`, async ({ page }) => {
  await add(page, [png('a.png', 96), png('b.png', 104)]);
  await pane(page, 'Pages');
  await add(page, [png('c.png', 112), png('d.png', 120)]);
  await expect(list(page)).toHaveCount(4);
  await settings(page, 'fit');
  expect(widthsPx((await create(page)).doc)).toEqual([96, 104, 112, 120]);
});

test(`${T('keyboard-reorder')} reorder by keyboard; focus stays usable; order read from the downloaded PDF`, async ({ page }) => {
  await add(page, [png('a.png', 96), png('b.png', 128), png('c.png', 160)]);
  await pane(page, 'Pages');
  const upC = page.getByRole('button', { name: 'Move c.png up' });
  await upC.focus();
  await page.keyboard.press('Enter');
  // Focus follows the moved item, so a second Enter moves it again.
  await expect(page.getByRole('button', { name: 'Move c.png up' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').first()).toContainText('c.png moved to position 1');
  // At the top, "up" is disabled: focus moved to the next usable control of the same item.
  await expect(page.getByRole('button', { name: 'Move c.png down' })).toBeFocused();
  await page.keyboard.press('Enter');
  await settings(page, 'fit');
  expect(widthsPx((await create(page)).doc)).toEqual([96, 160, 128]);
});

test(`${T('remove-focus')} removing an image moves focus to a neighbour, then to the picker`, async ({ page }) => {
  await add(page, [png('a.png', 96), png('b.png', 128)]);
  await pane(page, 'Pages');
  const removeA = page.getByRole('button', { name: 'Remove a.png' });
  await removeA.focus();
  await page.keyboard.press('Enter');
  await expect(list(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Remove b.png' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(list(page)).toHaveCount(0);
  await expect(page.locator('input[type=file]').first()).toBeFocused();
});

for (const [paper, w, h] of [['a4', 595.28, 841.89], ['letter', 612, 792]] as const) {
  test(`${T(`page-${paper}`)} ${paper} pages measured from the downloaded PDF (orientation follows the image)`, async ({ page }) => {
    await add(page, [png('wide.png', 300, 100), png('tall.png', 100, 300)]);
    await settings(page, paper, '18');
    const pages = (await create(page)).doc.getPages().map((p) => [+p.getWidth().toFixed(2), +p.getHeight().toFixed(2)]);
    expect(pages).toEqual([[h, w], [w, h]]);
  });
}

test(`${T('page-fit')} "Same as each image" pages match each image at 96 DPI`, async ({ page }) => {
  await add(page, [png('wide.png', 300, 100), png('tall.png', 100, 300)]);
  await settings(page, 'fit');
  const pages = (await create(page)).doc.getPages().map((p) => [p.getWidth(), p.getHeight()]);
  expect(pages).toEqual([[225, 75], [75, 225]]);
});

test(`${T('limit-over')} over the limit after serialization: exact numbers match the download; Adjust settings is primary`, async ({ page }) => {
  await add(page, [{ name: 'a.png', mimeType: 'image/png', buffer: noisyPng(1200, 900, 1) }]);
  await pane(page, /Settings|Result/);
  await page.getByLabel('Keep the file at or under a limit').check();
  await page.getByLabel('Maximum size').fill('20');
  await page.locator('#pdf-unit').selectOption('KB');
  await page.getByRole('button', { name: 'Create PDF' }).click();
  const note = page.getByTestId('over-limit');
  await expect(note).toBeVisible({ timeout: 90_000 });
  const out = await downloadVia(page, page.getByTestId('download'));
  expect(out.bytes.length).toBeGreaterThan(20_000);
  await expect(note).toContainText(`Smallest PDF: ${out.bytes.length.toLocaleString('en-US')} bytes, limit 20,000 bytes`);
  await expect(note).toContainText(`${(out.bytes.length - 20_000).toLocaleString('en-US')} bytes over`);
  await expect(page.getByTestId('download')).toContainText('anyway');
  // The primary action is "Adjust settings": first in the action bar and filled (default variant).
  const actions = page.locator('form#pdf-inspector, form').filter({ has: page.getByRole('button', { name: 'Adjust settings' }) }).first();
  const adjust = actions.getByRole('button', { name: 'Adjust settings' }).first();
  await expect(adjust).toBeVisible();
  await expect(adjust).toHaveAttribute('data-variant', 'default');
  await expect(page.getByTestId('download').locator('xpath=ancestor-or-self::*[@data-variant][1]')).not.toHaveAttribute('data-variant', 'default');
  await adjust.click();
  await expect(page.getByLabel('Maximum size')).toBeFocused();
  // Preview fingerprint of the over-limit result was the downloaded file too.
  await pane(page, /Pages|Preview/);
  await expect(page.getByTestId('pdf-pages')).toHaveAttribute('data-sha256', sha(out.bytes));
});

test(`${T('total-limit-over')} @release real files over 200 MB in total: the last one is refused`, async ({ page }, info) => {
  test.setTimeout(600_000);
  // Five valid PNGs of 40,000,000 bytes each (an IDAT plus a large ancillary chunk) = exactly 200,000,000, then one more byte's worth.
  const big = (n: number, size: number): Payload => {
    const base = solidPng(8, 8, [n * 40, 0, 0]);
    const iend = base.subarray(base.length - 12);
    const pad = Buffer.alloc(size - base.length - 12);
    pad.writeUInt32BE(pad.length - 12, 0);
    pad.write('teXt', 4, 'latin1');
    return { name: `big${n}.png`, mimeType: 'image/png', buffer: Buffer.concat([base.subarray(0, base.length - 12), pad, iend]) };
  };
  // Playwright cannot pass buffers over 50 MB: write the files under this test's output folder and pass paths.
  const paths = [1, 2, 3, 4, 5].map((n) => {
    const f = big(n, 40_000_000);
    const path = info.outputPath(f.name);
    writeFileSync(path, f.buffer);
    return path;
  });
  await page.getByLabel('Add images').setInputFiles(paths);
  await expect(list(page)).toHaveCount(5, { timeout: 120_000 });
  await pane(page, 'Pages');
  await add(page, [png('one-more.png', 8, 8)]);
  await pane(page, /Settings|Result/);
  await expect(alerts(page).filter({ hasText: 'one-more.png (the images would add up to more than 200 MB)' })).toBeVisible({ timeout: 60_000 });
  await expect(list(page)).toHaveCount(5);
});
