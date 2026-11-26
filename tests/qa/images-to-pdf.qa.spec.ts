import { copyFileSync, constants, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import {
  blue, decodeSample, pickInPage, slowReads, download, dropFiles, expect, fmt, fx, hookPdfPreviewHashes, inspectPdf, isDesktop, magic, near, pdfOutcome, QA, red, setLimit,
  sha, test, white, writeJson,
} from './qa-helpers';

const PAGES = ['pages/page-1.jpg', 'pages/page-2.png', 'pages/page-3.webp', 'pages/page-4.jpg', 'pages/page-5.png'];
const COLORS = ['#d32f2f', '#388e3c', '#1976d2', '#f9a825', '#7b1fa2'];
const add = (page: Page, files: string[]) => page.getByLabel('Add images').setInputFiles(files.map(fx));
const items = (page: Page) => page.getByRole('list', { name: 'Pages in order' }).getByRole('listitem');
const create = (page: Page) => page.getByRole('button', { name: 'Create PDF' }).click();
const alert = (page: Page) => page.locator('main [role=alert]');

/** Colour at the centre-left (avoids the white page number) and the top-left marker of each embedded image. */
async function pageColours(page: Page, bytes: Uint8Array) {
  const info = await inspectPdf(bytes);
  const out: { color: number[]; marker: number[]; size: [number, number] }[] = [];
  for (const p of info.pages) {
    const img = p.images[0]!;
    const s = await decodeSample(page, img.bytes, { c: [0.25, 0.5], m: [0.03, 0.03] });
    out.push({ color: s.samples.c, marker: s.samples.m, size: [s.width, s.height] });
  }
  return { info, out };
}
const which = (rgb: number[]) => COLORS.findIndex((c) => near(rgb, c, 45)) + 1;

test.describe('images-to-pdf', () => {
  test('P01 single image, A4 default: 1 page, A4 portrait size, preview==download', async ({ page, out, verdict }) => {
    await hookPdfPreviewHashes(page);
    const worker = page.waitForEvent('worker');
    await page.goto('/images-to-pdf');
    await add(page, ['portrait.jpg']);
    await create(page);
    await pdfOutcome(page);
    await expect(page.getByText(/Preview of the exported PDF: 1 page\./)).toBeVisible({ timeout: 30_000 });
    const d = await download(page, out);
    expect(d.name).toBe('images.pdf');
    expect(magic(d.bytes)).toBe('pdf');
    const info = await inspectPdf(d.bytes);
    expect(info.pageCount).toBe(1);
    expect(info.pages[0]!.width).toBeCloseTo(595.28, 1);
    expect(info.pages[0]!.height).toBeCloseTo(841.89, 1);
    const hashes = await page.evaluate(() => (window as unknown as { __pdfHashes: string[] }).__pdfHashes);
    expect(hashes, 'PDF.js preview received exactly the downloaded bytes').toContain(sha(d.bytes));
    const meta = (await page.getByTestId('pdf-meta').textContent())!.trim();
    expect((await worker).url()).toMatch(/\/_next\/static\/chunks\/[^/]+\.js$/);
    verdict(`meta text: "${meta}"; producer ${info.producer}`);
    expect.soft(meta, 'singular "1 page"').toMatch(/^1 page ·/);
  });

  test('P02 five numbered pages, mixed JPG/PNG/WebP, portrait+landscape: order, sizes, orientation from the downloaded PDF', async ({ page, out, verdict }) => {
    await hookPdfPreviewHashes(page);
    await page.goto('/images-to-pdf');
    await add(page, PAGES);
    await expect(items(page)).toHaveCount(5);
    await create(page);
    await pdfOutcome(page);
    await expect(page.getByText(/Preview of the exported PDF: 5 pages/)).toBeVisible({ timeout: 30_000 });
    const d = await download(page, out);
    const { info, out: cols } = await pageColours(page, d.bytes);
    expect(info.pageCount).toBe(5);
    expect(cols.map((c) => which(c.color))).toEqual([1, 2, 3, 4, 5]);
    for (const c of cols) expect(c.marker[0]! < 60 && c.marker[1]! < 60 && c.marker[2]! < 60, 'black marker stays top-left (no rotation/flip)').toBe(true);
    const land = info.pages.map((p) => p.width > p.height);
    expect(land).toEqual([false, true, false, true, false]);
    expect(cols.map((c) => c.size)).toEqual([[800, 1100], [1100, 800], [800, 1100], [1200, 700], [700, 1000]]);
    // Preview canvases in the same order.
    const prev = await page.getByTestId('pdf-pages').locator('canvas').evaluateAll((els) =>
      (els as HTMLCanvasElement[]).map((c) => [...c.getContext('2d')!.getImageData(Math.floor(c.width * 0.25), Math.floor(c.height / 2), 1, 1).data]),
    );
    expect(prev.map(which)).toEqual([1, 2, 3, 4, 5]);
    expect(await page.evaluate(() => (window as unknown as { __pdfHashes: string[] }).__pdfHashes)).toContain(sha(d.bytes));
    for (const p of info.pages) {
      const pl = p.placement!;
      // Inside the 18 pt margin, centred, not cropped.
      expect(pl.x).toBeGreaterThanOrEqual(18 - 0.01);
      expect(pl.y).toBeGreaterThanOrEqual(18 - 0.01);
      expect(pl.x + pl.w).toBeLessThanOrEqual(p.width - 18 + 0.01);
      expect(pl.y + pl.h).toBeLessThanOrEqual(p.height - 18 + 0.01);
    }
    await page.screenshot({ path: join(out, 'result.png'), fullPage: true });
    writeJson(out, 'p02.json', { bytes: d.bytes.length, sha: sha(d.bytes), pages: info.pages.map((p, i) => ({ size: [+p.width.toFixed(2), +p.height.toFixed(2)], placement: p.placement, image: cols[i]!.size, page: which(cols[i]!.color) })) });
    verdict(`${d.bytes.length} B, order 1-5, landscape pages 2,4`);
  });

  test('P03 two different files with the same name: distinct accessible names with position; actions hit the right item (B5)', async ({ page, out, verdict }) => {
    await page.goto('/images-to-pdf');
    await add(page, ['dup-a/scan.png', 'dup-b/scan.png']);
    await expect(items(page)).toHaveCount(2);
    const names = await page.getByRole('list', { name: 'Pages in order' }).getByRole('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
    expect(new Set(names).size, 'every control has a unique accessible name').toBe(names.length);
    await expect(page.getByRole('button', { name: 'Remove scan.png (page 1)', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Remove scan.png (page 2)', exact: true })).toHaveCount(1);
    // Move the second (orange) up, then remove the one now at page 2 (cyan): only orange must remain.
    await page.getByRole('button', { name: 'Move scan.png up (page 2)', exact: true }).click();
    await page.getByRole('button', { name: 'Remove scan.png (page 2)', exact: true }).click();
    await expect(items(page)).toHaveCount(1);
    await create(page);
    await pdfOutcome(page);
    const d = await download(page, out);
    const { out: cols } = await pageColours(page, d.bytes);
    expect(cols.length).toBe(1);
    expect(near(cols[0]!.color, '#ff5722')).toBe(true);
    verdict(`labels: ${names.join(' | ')}; after move+remove the PDF holds the orange image only`);
  });

  test('P04 add in two batches, keyboard reorder and remove; focus stays on the moved item / neighbour / picker (B6)', async ({ page, out, verdict }) => {
    await page.goto('/images-to-pdf');
    await add(page, PAGES.slice(0, 2));
    await expect(page.getByRole('status')).toContainText('2 images added: page-1.jpg, page-2.png');
    await add(page, PAGES.slice(2));
    await expect(page.getByRole('status')).toContainText('3 images added');
    await expect(items(page)).toHaveCount(5);
    const active = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? (document.activeElement as HTMLInputElement)?.type ?? document.activeElement?.tagName ?? '');
    await page.getByRole('button', { name: 'Move page-5.png up (page 5)' }).focus();
    const trail: string[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Enter');
      trail.push(await active());
    }
    expect(trail.slice(0, 3)).toEqual(['Move page-5.png up (page 4)', 'Move page-5.png up (page 3)', 'Move page-5.png up (page 2)']);
    // At the top "up" is disabled: focus moves to the same item's "down" button, never to <body>.
    expect(trail[3]).toBe('Move page-5.png down (page 1)');
    await page.getByRole('button', { name: 'Remove page-3.webp (page 4)' }).focus();
    await page.keyboard.press('Enter');
    const afterRemove = await active();
    expect(afterRemove, 'focus goes to the item that took its place').toBe('Remove page-4.jpg (page 4)');
    await expect(items(page)).toHaveCount(4);
    // Remove the last item → focus the previous one.
    await page.getByRole('button', { name: 'Remove page-4.jpg (page 4)' }).focus();
    await page.keyboard.press('Enter');
    expect(await active()).toBe('Remove page-2.png (page 3)');
    await page.getByRole('button', { name: 'Create PDF' }).focus();
    await page.keyboard.press('Enter');
    await pdfOutcome(page);
    const d = await download(page, out);
    const { out: cols } = await pageColours(page, d.bytes);
    expect(cols.map((c) => which(c.color))).toEqual([5, 1, 2]);
    // Remove everything with the keyboard → focus lands on the file picker.
    for (let i = 0; i < 3; i++) {
      await page.getByRole('list', { name: 'Pages in order' }).getByRole('button', { name: /^Remove/ }).first().focus();
      await page.keyboard.press('Enter');
    }
    await expect(items(page)).toHaveCount(0);
    expect(await active()).toBe('file');
    verdict(`focus trail ${trail.join(' → ')}; after remove: ${afterRemove}; empty list → file input`);
  });

  test('P05 drag-and-drop several files onto the drop zone', async ({ page }) => {
    await page.goto('/images-to-pdf');
    await dropFiles(page.getByText(/^Or drop JPG/).locator('..'), [
      { path: fx(PAGES[0]!), mime: 'image/jpeg' },
      { path: fx(PAGES[1]!), mime: 'image/png' },
      { path: fx(PAGES[2]!), mime: 'image/webp' },
    ]);
    await expect(items(page)).toHaveCount(3);
    await expect(items(page).nth(2)).toContainText('page-3.webp');
  });

  test('P06 every paper size × margin: page size, placement, aspect ratio, no cropping', async ({ page, out }) => {
    await page.goto('/images-to-pdf');
    await add(page, ['pages/page-1.jpg', 'pages/page-2.png']);
    const results: unknown[] = [];
    for (const paper of ['a4', 'letter', 'fit'] as const)
      for (const margin of [0, 18, 36]) {
        await page.getByLabel('Paper').selectOption(paper);
        await page.getByLabel('Margin').selectOption(String(margin));
        await create(page);
        await pdfOutcome(page);
        const d = await download(page, out, `${paper}-${margin}-`);
        const info = await inspectPdf(d.bytes);
        const imgs = [[800, 1100], [1100, 800]];
        info.pages.forEach((p, i) => {
          const [iw, ih] = imgs[i]!;
          const land = iw! > ih!;
          if (paper === 'fit') {
            expect(p.width).toBeCloseTo(iw! * 0.75 + 2 * margin, 1);
            expect(p.height).toBeCloseTo(ih! * 0.75 + 2 * margin, 1);
          } else {
            const [a, b] = paper === 'a4' ? [595.28, 841.89] : [612, 792];
            expect(p.width).toBeCloseTo(land ? b : a, 1);
            expect(p.height).toBeCloseTo(land ? a : b, 1);
          }
          const pl = p.placement!;
          expect(Math.abs(pl.w / pl.h - iw! / ih!)).toBeLessThan(0.002);
          expect(pl.x).toBeGreaterThanOrEqual(margin - 0.01);
          expect(pl.y).toBeGreaterThanOrEqual(margin - 0.01);
          expect(pl.x + pl.w).toBeLessThanOrEqual(p.width - margin + 0.01);
          expect(pl.y + pl.h).toBeLessThanOrEqual(p.height - margin + 0.01);
          expect(Math.abs(pl.x - (p.width - pl.x - pl.w))).toBeLessThan(0.02); // centred
          results.push({ paper, margin, page: i + 1, size: [+p.width.toFixed(2), +p.height.toFixed(2)], placement: pl });
        });
      }
    writeJson(out, 'paper-margin.json', results);
  });

  test('P07 EXIF orientation, transparency and small text inside the PDF', async ({ page, out, verdict }) => {
    await page.goto('/images-to-pdf');
    await add(page, ['exif-6.jpg', 'exif-3.jpg', 'transparent.png', 'document.png']);
    await page.getByLabel('Paper').selectOption('fit');
    await page.getByLabel('Margin').selectOption('0');
    await create(page);
    await pdfOutcome(page);
    const d = await download(page, out);
    const info = await inspectPdf(d.bytes);
    const e6 = await decodeSample(page, info.pages[0]!.images[0]!.bytes, { red: [0.9, 0.1], blue: [0.05, 0.95] });
    expect([e6.width, e6.height]).toEqual([120, 240]);
    expect(info.pages[0]!.height).toBeGreaterThan(info.pages[0]!.width);
    expect(red(e6.samples.red)).toBe(true);
    expect(blue(e6.samples.blue)).toBe(true);
    const e3 = await decodeSample(page, info.pages[1]!.images[0]!.bytes, { red: [0.9, 0.9], blue: [0.05, 0.05] });
    expect(red(e3.samples.red) && blue(e3.samples.blue)).toBe(true);
    const tr = await decodeSample(page, info.pages[2]!.images[0]!.bytes, { clear: [0.1, 0.5], green: [0.65, 0.5] });
    expect(white(tr.samples.clear), 'transparent → white').toBe(true);
    expect(near(tr.samples.green, '#008000', 45)).toBe(true);
    const doc = info.pages[3]!.images[0]!;
    writeFileSync(join(out, 'document-embedded.jpg'), doc.bytes);
    expect([doc.width, doc.height]).toEqual([1600, 1000]);
    verdict(`EXIF 6/3 upright once; alpha → white; document embedded ${doc.width}×${doc.height} JPEG ${doc.bytes.length} B (crop: document-embedded.jpg)`);
  });

  test('P08 size limit on the serialized PDF: fits, fails, and the exact byte boundary', async ({ page, out, verdict }) => {
    await page.goto('/images-to-pdf');
    await add(page, PAGES.slice(0, 3));
    // Large limit: first candidate (quality 0.95) fits → size S.
    await setLimit(page, '10', 'MB', 'pdf');
    await create(page);
    await pdfOutcome(page);
    const big = await download(page, out, 'big-');
    const S = big.bytes.length;
    await expect(page.getByText('Within limit')).toBeVisible();
    await setLimit(page, String(S / 1000), 'KB', 'pdf');
    await create(page);
    await pdfOutcome(page);
    const at = await download(page, out, 'at-');
    expect(at.bytes.length).toBe(S);
    expect(sha(at.bytes)).toBe(sha(big.bytes));
    await setLimit(page, String((S - 1) / 1000), 'KB', 'pdf');
    await create(page);
    await pdfOutcome(page);
    const under = await download(page, out, 'minus1-');
    expect(under.bytes.length).toBeLessThanOrEqual(S - 1);
    await expect(page.getByTestId('pdf-meta')).toContainText(fmt(under.bytes.length));
    verdict(`S=${S} B; limit S → same bytes; limit S−1 → ${under.bytes.length} B (${await page.getByTestId('pdf-meta').textContent()})`);
  });

  test('P08b impossible limit without resize → over limit; with resize → within or explained', async ({ page, out, verdict }) => {
    await page.goto('/images-to-pdf');
    await add(page, ['detail.png', 'landscape.jpg']);
    await setLimit(page, '60', 'KB', 'pdf');
    await create(page);
    await pdfOutcome(page);
    await expect(page.getByRole('heading', { name: 'Your PDF (over the limit)' })).toBeVisible();
    const over = await download(page, out, 'over-');
    await expect(page.getByText(`Smallest PDF: ${over.bytes.length.toLocaleString('en-US')} bytes, limit 60,000 bytes.`)).toBeVisible();
    expect(over.bytes.length).toBeGreaterThan(60_000);
    await page.getByLabel(/Allow lower image resolution/).check();
    await create(page);
    await pdfOutcome(page);
    const d = await download(page, out, 'resized-');
    const ok = await page.getByRole('heading', { name: 'Your PDF', exact: true }).isVisible();
    if (ok) expect(d.bytes.length).toBeLessThanOrEqual(60_000);
    else expect(d.bytes.length).toBeGreaterThan(60_000);
    verdict(`no resize: ${over.bytes.length} B over; resize: ${d.bytes.length} B ${ok ? 'within' : 'still over (explained)'}; meta "${await page.getByTestId('pdf-meta').textContent()}"`);
  });

  test('P09 mixed batch: invalid and cut-off files are skipped by name at add, the PDF holds only valid images (B2)', async ({ page, out, verdict }, info) => {
    await page.goto('/images-to-pdf');
    const files = ['pages/page-1.jpg', 'notes.txt', 'empty.png', 'unsupported.gif', 'truncated.jpg', 'truncated-99.jpg', 'pages/page-2.png', 'hdr-10000x5001.png', 'progressive.jpg', 'trailing-data.jpg'];
    if (existsSync(fx('progressive-truncated.jpg'))) files.push('progressive-truncated.jpg');
    if (isDesktop(info.project.name)) files.push('bytes-50000001-over.png');
    await add(page, files.filter((f) => existsSync(fx(f))));
    await expect(items(page)).toHaveCount(4);
    const skipped = (await alert(page).textContent())!;
    for (const s of ['notes.txt (not JPG, PNG or WebP)', 'empty.png (empty)', 'unsupported.gif (not JPG, PNG or WebP)', 'hdr-10000x5001.png (10000×5001px', 'truncated.jpg (damaged or incomplete JPEG)', 'truncated-99.jpg (damaged or incomplete JPEG)'])
      expect(skipped).toContain(s);
    if (files.includes('progressive-truncated.jpg')) expect(skipped).toContain('progressive-truncated.jpg (damaged or incomplete JPEG)');
    if (isDesktop(info.project.name)) expect(skipped).toContain('bytes-50000001-over.png (over 50 MB)');
    const status = (await page.getByRole('status').textContent())!;
    expect(status).toContain('4 images added: page-1.jpg, page-2.png, progressive.jpg, trailing-data.jpg');
    await create(page);
    await pdfOutcome(page);
    await expect(alert(page).filter({ hasText: 'DECODE_FAILED' })).toHaveCount(0);
    const d = await download(page, out);
    const { info: pdf, out: cols } = await pageColours(page, d.bytes);
    expect(pdf.pageCount).toBe(4);
    expect(cols.slice(0, 2).map((c) => which(c.color))).toEqual([1, 2]);
    expect(pdf.pages[2]!.images[0]!.height).toBe(1800); // progressive.jpg embedded upright, whole
    verdict(`skipped: "${skipped}" | added: "${status}" | PDF 4 pages`);
  });

  test('P10 remove all images clears the result; reorder after a result clears it', async ({ page }) => {
    await page.goto('/images-to-pdf');
    await add(page, PAGES.slice(0, 2));
    await create(page);
    await pdfOutcome(page);
    await page.getByRole('button', { name: 'Move page-2.png up' }).click();
    await expect(page.getByTestId('pdf-meta')).toHaveCount(0);
    await create(page);
    await pdfOutcome(page);
    await page.getByRole('button', { name: 'Remove page-1.jpg' }).click();
    await page.getByRole('button', { name: 'Remove page-2.png' }).click();
    await expect(items(page)).toHaveCount(0);
    await expect(page.getByTestId('pdf-meta')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create PDF' })).toBeDisabled();
  });

  test('P11 reorder while the PDF is being built: stale job dropped, rebuild uses the new order', async ({ page, out, verdict }) => {
    await page.goto('/images-to-pdf');
    await add(page, [...PAGES, 'detail.png']);
    await setLimit(page, '40', 'KB', 'pdf');
    await page.getByLabel(/Allow lower image resolution/).check();
    await page.evaluate(() => {
      new PerformanceObserver((list, obs) => {
        if (!list.getEntriesByName('lovert:job-sent').length) return;
        obs.disconnect();
        setTimeout(() => document.querySelector<HTMLButtonElement>('button[aria-label^="Move page-2.png up"]')!.click(), 50);
      }).observe({ type: 'mark' });
    });
    await create(page);
    await expect(items(page).first()).toContainText('page-2.png', { timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => performance.getEntriesByName('lovert:job-discarded').length)).toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('pdf-meta')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create PDF' })).toBeEnabled();
    await page.getByLabel(/Allow lower image resolution/).uncheck();
    await setLimit(page, null, 'KB', 'pdf');
    await create(page);
    await pdfOutcome(page);
    const d = await download(page, out);
    const { out: cols } = await pageColours(page, d.bytes);
    expect(cols.slice(0, 5).map((c) => which(c.color))).toEqual([2, 1, 3, 4, 5]);
    const stopped = await page.evaluate(() => performance.getEntriesByName('lovert:job-stopped').length + '/' + performance.getEntriesByName('lovert:job-late-result').length);
    verdict(`old job stopped/late: ${stopped}`);
  });

  test('P12 image count: 50 accepted, the 51st skipped by name; 50-page PDF built', async ({ page, out }) => {
    await page.goto('/images-to-pdf');
    const all = Array.from({ length: 51 }, (_, i) => `many/img-${String(i + 1).padStart(2, '0')}.png`);
    await add(page, all);
    await expect(items(page)).toHaveCount(50);
    await expect(alert(page)).toContainText('img-51.png (over 50 images)');
    await create(page);
    await pdfOutcome(page);
    const d = await download(page, out);
    expect((await inspectPdf(d.bytes)).pageCount).toBe(50);
    await add(page, ['small.jpg']);
    await expect(alert(page)).toContainText('small.jpg (over 50 images)');
  });

  test('P13 total 200 MB is enforced when adding, by name; accepted images are listed; the check before Create remains (B7)', async ({ page, out, verdict }, info) => {
    test.skip(!isDesktop(info.project.name), 'desktop only (≈250 MB in memory)');
    const big: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const p = join(QA, 'fixtures', `big-${i}.png`);
      if (!existsSync(p)) copyFileSync(fx('bytes-49900000.png'), p, constants.COPYFILE_FICLONE);
      big.push(`big-${i}.png`);
    }
    await page.goto('/images-to-pdf');
    await add(page, big.slice(0, 4));
    await expect(items(page)).toHaveCount(4);
    // One batch that crosses the limit: small.jpg fits (199.6 MB + 2.3 KB), big-5 does not.
    await add(page, ['small.jpg', big[4]!]);
    await expect(items(page)).toHaveCount(5);
    await expect(alert(page)).toContainText('big-5.png (the images would add up to more than 200 MB)');
    await expect(page.getByRole('status')).toContainText('1 image added: small.jpg');
    const t0 = Date.now();
    await create(page);
    await pdfOutcome(page);
    const ms = Date.now() - t0;
    await expect(page.getByTestId('pdf-meta')).toContainText('5 pages');
    writeJson(out, 'p13.json', { ms });
    verdict(`big-5 refused at add with reason; 5 pages built in ${ms} ms; worker FILE_TOO_LARGE check kept (unit: imagesToPdf)`);
  });

  test('P14 real 50 MP image (10000×5000) in a PDF', async ({ page, out, verdict }, info) => {
    test.skip(!isDesktop(info.project.name), 'desktop only');
    await page.goto('/images-to-pdf');
    await add(page, ['limit-50mp-exact.jpg']);
    const t0 = Date.now();
    await create(page);
    await pdfOutcome(page);
    const ms = Date.now() - t0;
    await expect(alert(page)).toHaveCount(0);
    const d = await download(page, out);
    const inf = await inspectPdf(d.bytes);
    expect(inf.pages[0]!.images[0]!.width).toBe(10000);
    expect(inf.pages[0]!.width).toBeGreaterThan(inf.pages[0]!.height);
    verdict(`${ms} ms, ${d.bytes.length} B`);
  });

  test('P15 Unicode names in the list; PDF metadata has no file names', async ({ page, out }) => {
    await page.goto('/images-to-pdf');
    const name = 'ảnh-thử nghiệm 日本 😀.png';
    await page.getByLabel('Add images').setInputFiles({ name, mimeType: 'image/png', buffer: readFileSync(fx(name)) });
    await expect(items(page).first()).toContainText(name);
    await create(page);
    await pdfOutcome(page);
    const d = await download(page, out);
    expect(d.name).toBe('images.pdf');
    const raw = d.bytes.toString('latin1');
    expect(raw.includes('nghi')).toBe(false);
    expect(raw).not.toMatch(/\.png|\.jpg/);
  });

  test('P16 cut-off PNG and WebP are skipped by name at add (B2 extended to PNG/WebP)', async ({ page }) => {
    await page.goto('/images-to-pdf');
    await add(page, ['pages/page-1.jpg', 'truncated.png', 'truncated.webp']);
    await expect(items(page)).toHaveCount(1);
    await expect(alert(page)).toContainText('truncated.png (damaged or incomplete PNG)');
    await expect(alert(page)).toContainText('truncated.webp (damaged or incomplete WebP)');
  });

  test('P17 B3 regression for batches: batch A (slow read) then batch B (fast): order A then B, nothing lost', async ({ page }) => {
    await slowReads(page, { 'a-slow.jpg': 1500 });
    await page.goto('/images-to-pdf');
    await pickInPage(page, [
      { name: 'a-slow.jpg', b64: readFileSync(fx(PAGES[0]!)).toString('base64'), type: 'image/jpeg' },
      { name: 'b-fast.png', b64: readFileSync(fx(PAGES[1]!)).toString('base64'), type: 'image/png' },
    ]);
    await expect(items(page)).toHaveCount(2, { timeout: 10_000 });
    await expect(items(page).nth(0)).toContainText('a-slow.jpg');
    await expect(items(page).nth(1)).toContainText('b-fast.png');
    await expect(page.getByRole('status')).toContainText('1 image added: b-fast.png');
  });

  test('P17b B3: batch A fails late (invalid, slow) then batch B: B is added, final message belongs to B', async ({ page }) => {
    await slowReads(page, { 'a-bad.png': 1500 });
    await page.goto('/images-to-pdf');
    await pickInPage(page, [
      { name: 'a-bad.png', b64: readFileSync(fx('notes.txt')).toString('base64'), type: 'image/png' },
      { name: 'b-ok.png', b64: readFileSync(fx(PAGES[1]!)).toString('base64'), type: 'image/png' },
    ]);
    await expect(items(page)).toHaveCount(1, { timeout: 10_000 });
    await expect(items(page).first()).toContainText('b-ok.png');
    await expect(page.getByRole('status')).toContainText('1 image added: b-ok.png');
    await expect(alert(page)).toHaveCount(0);
  });

  test('X06 UI states screenshots + no horizontal overflow (idle, skipped, working, result)', async ({ page, out }) => {
    await page.goto('/images-to-pdf');
    await page.screenshot({ path: join(out, '1-idle.png'), fullPage: true });
    await add(page, ['notes.txt', ...PAGES, 'ảnh-thử nghiệm 日本 😀.png']);
    await page.screenshot({ path: join(out, '2-list-skipped.png'), fullPage: true });
    await create(page);
    await page.screenshot({ path: join(out, '3-working.png'), fullPage: true });
    await pdfOutcome(page);
    await expect(page.getByText(/Preview of the exported PDF/)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: join(out, '4-result.png'), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0);
  });
});
