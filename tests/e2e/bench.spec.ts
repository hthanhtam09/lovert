/**
 * @bench — timing and quality samples. Run with `pnpm bench` (BENCH=1). Not part of the default e2e run.
 * Inputs are generated in the page with a seeded PRNG (photo-like noise + shapes + text), so runs are reproducible
 * per browser. Times are wall-clock from clicking the button to the final status, measured by the test
 * (includes Playwright polling, ~100 ms granularity).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { photoJpeg } from './helpers';

test.skip(({ isMobile }) => isMobile, 'Mobile emulation uses the same engine as chromium; skip to save time');
test.describe.configure({ mode: 'serial', timeout: 600_000 });

const OUT = 'docs/benchmarks/samples';
const results: Record<string, unknown>[] = [];

/** Small text (7–14 px) and fake signature strokes. Not a real document or signature. */
async function textSample(page: Page): Promise<Buffer> {
  const data = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 800;
    const x = c.getContext('2d')!;
    x.fillStyle = '#fbfaf7';
    x.fillRect(0, 0, 1200, 800);
    x.fillStyle = '#111';
    let y = 40;
    for (const px of [7, 8, 9, 10, 12, 14]) {
      x.font = `${px}px sans-serif`;
      x.fillText(`${px}px — SAMPLE TEXT, not a real document. 0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz`, 30, y);
      y += px * 2.2;
    }
    x.strokeStyle = '#1a2a8a';
    x.lineCap = 'round';
    for (const [lw, oy] of [[1, 420], [1.5, 520], [2.5, 640]] as const) {
      x.lineWidth = lw;
      x.beginPath();
      x.moveTo(80, oy);
      for (let i = 0; i < 12; i++) x.bezierCurveTo(120 + i * 70, oy - 60, 150 + i * 70, oy + 50, 180 + i * 70, oy - (i % 3) * 10);
      x.stroke();
    }
    x.font = '11px serif';
    x.fillText('Fake signature strokes at 1, 1.5 and 2.5 px line width', 80, 740);
    const b = await new Promise<Blob>((r) => c.toBlob((bl) => r(bl!), 'image/png'));
    return [...new Uint8Array(await b.arrayBuffer())];
  });
  return Buffer.from(data);
}

async function timeCompress(page: Page, name: string, buf: Buffer, mime: string, opts: { format: 'JPEG' | 'WebP' | 'PNG'; limitKB?: number; resize?: boolean }) {
  await page.goto('/compress-image');
  await page.getByLabel('Choose an image').setInputFiles({ name, mimeType: mime, buffer: buf });
  await page.getByLabel(opts.format, { exact: true }).check();
  if (opts.limitKB) await page.getByLabel('Maximum size').fill(String(opts.limitKB));
  else await page.getByLabel('Keep the file at or under a limit').uncheck();
  if (opts.resize) await page.getByLabel(/Allow smaller dimensions/).check();
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Compress' }).click();
  await expect(page.getByRole('status')).toContainText(/passed all checks|over the limit/, { timeout: 540_000 });
  const ms = Date.now() - t0;
  const status = (await page.getByRole('status').textContent())!.includes('passed') ? 'ok' : 'over_limit';
  const caption = (await page.getByTestId('after-caption').textContent())!.trim();
  const responsive = await page.evaluate(() => new Promise<number>((r) => { const t = performance.now(); requestAnimationFrame(() => r(performance.now() - t)); }));
  return { ms, status, caption, inputBytes: buf.length, frameAfterMs: Math.round(responsive) };
}

test('@bench compress timing by size', async ({ page }, info) => {
  await page.goto('/compress-image');
  for (const [w, h] of [[1200, 900], [4000, 3000], [8000, 6000]] as const) {
    const buf = await photoJpeg(page, w, h, 42);
    const r = await timeCompress(page, `photo-${w}x${h}.jpg`, buf, 'image/jpeg', { format: 'JPEG', limitKB: 500 });
    results.push({ browser: info.project.name, tool: 'compress-image', input: `${w}×${h} (${((w * h) / 1e6).toFixed(1)} MP) JPEG`, target: 'JPEG ≤ 500 KB, no resize', ...r });
  }
});

test('@bench images-to-pdf timing', async ({ page }, info) => {
  await page.goto('/images-to-pdf');
  const imgs = [];
  for (let i = 0; i < 3; i++) imgs.push({ name: `p${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: await photoJpeg(page, 4000, 3000, 7 + i) });
  await page.getByLabel('Add images').setInputFiles(imgs);
  await page.getByLabel('Keep the file at or under a limit').check();
  await page.getByLabel('Maximum size').fill('1');
  await page.getByLabel(/Allow lower image resolution/).check();
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByTestId('pdf-meta')).toBeVisible({ timeout: 540_000 });
  const ms = Date.now() - t0;
  results.push({ browser: info.project.name, tool: 'images-to-pdf', input: '3 × 4000×3000 JPEG', target: 'A4, ≤ 1 MB, lower resolution allowed', ms, caption: (await page.getByTestId('pdf-meta').textContent())!.trim() });
});

test('@bench small text / fake signature samples', async ({ page }, info) => {
  mkdirSync(OUT, { recursive: true });
  await page.goto('/compress-image');
  const src = await textSample(page);
  writeFileSync(`${OUT}/text-source.png`, src);
  // Let the encoder probe finish before deciding whether WebP is offered.
  await page.waitForFunction(() => document.querySelector('#ci-webp-note') || performance.getEntriesByType('resource').some((e) => /chunks\/.*\.js/.test(e.name)), null, { timeout: 15_000 });
  await page.waitForTimeout(1500);
  const webpOk = !(await page.getByLabel('WebP').isDisabled());
  const configs: { format: 'JPEG' | 'WebP'; limitKB: number }[] = [
    { format: 'JPEG', limitKB: 150 },
    { format: 'JPEG', limitKB: 60 },
    ...(webpOk ? [{ format: 'WebP' as const, limitKB: 60 }] : []),
  ];
  for (const c of configs) {
    const r = await timeCompress(page, 'text.png', src, 'image/png', c);
    const ext = c.format === 'JPEG' ? 'jpg' : 'webp';
    const file = `${OUT}/text-${info.project.name}-${c.format.toLowerCase()}-${c.limitKB}kb.${ext}`;
    const bytes = await page.getByTestId('after-img').evaluate(async (img: HTMLImageElement) => [...new Uint8Array(await (await fetch(img.src)).arrayBuffer())]);
    writeFileSync(file, Buffer.from(bytes));
    // Same-zoom comparison: 200 % nearest-neighbour crop of the 7–10 px text and the 1 px stroke, source above output.
    const crop = await page.getByTestId('after-img').evaluate(async (img: HTMLImageElement, srcBytes: number[]) => {
      const out = await createImageBitmap(await (await fetch(img.src)).blob());
      const srcBmp = await createImageBitmap(new Blob([new Uint8Array(srcBytes)], { type: 'image/png' }));
      const c = document.createElement('canvas');
      c.width = 1000;
      c.height = 840;
      const x = c.getContext('2d')!;
      x.imageSmoothingEnabled = false;
      x.fillStyle = '#fff';
      x.fillRect(0, 0, 1000, 840);
      for (const [bmp, oy] of [[srcBmp, 0], [out, 420]] as const) {
        x.drawImage(bmp, 20, 20, 500, 100, 0, oy, 1000, 200); // small text rows
        x.drawImage(bmp, 60, 360, 500, 100, 0, oy + 210, 1000, 200); // 1 px stroke
      }
      const b = await new Promise<Blob>((r) => c.toBlob((bl) => r(bl!), 'image/png'));
      return [...new Uint8Array(await b.arrayBuffer())];
    }, [...src]);
    writeFileSync(file.replace(/\.(jpg|webp)$/, '-crop200.png'), Buffer.from(crop));
    results.push({ browser: info.project.name, tool: 'compress-image', input: '1200×800 PNG, small text + fake signature', target: `${c.format} ≤ ${c.limitKB} KB`, sample: file, ...r });
  }
});

test.afterAll(async ({ browserName: _b }, info) => {
  mkdirSync('docs/benchmarks', { recursive: true });
  writeFileSync(`docs/benchmarks/results-${info.project.name}.json`, JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
});
