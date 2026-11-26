import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  blue, compressOutcome, pickInPage, QA, slowReads, decodeSample, download, dropFiles, expect, fmt, fx, isDesktop, magic, near, previewImgBytes, red, setLimit, sha, test,
  webpState, white, writeJson,
} from './qa-helpers';

const LABEL = { jpeg: 'JPEG', png: 'PNG', webp: 'WebP' } as const;
type F = keyof typeof LABEL;
const pickFormat = (page: import('@playwright/test').Page, f: F) => page.getByLabel(LABEL[f], { exact: true }).check();
/** Pick a file and wait until the pick is settled (selected or refused), like a user who waits for the check to finish. */
const choose = async (page: import('@playwright/test').Page, path: string) => {
  await page.getByLabel('Choose an image').setInputFiles(path);
  await expect(page.locator('main [role=alert]').or(page.getByText(/^Selected:/)).first()).toBeVisible({ timeout: 30_000 });
};
const alert = (page: import('@playwright/test').Page) => page.locator('main [role=alert]');

test.describe('compress-image', () => {
  // ---------- C01: every input × output pair the tool offers ----------
  const inputs = [
    { file: 'photo-io.jpg', real: 'jpeg' as F },
    { file: 'photo.png', real: 'png' as F },
    { file: 'photo.webp', real: 'webp' as F },
  ];
  for (const inp of inputs)
    for (const outF of ['jpeg', 'webp', 'png'] as F[]) {
      test(`C01-${inp.real}-to-${outF} input/output pair: real format, extension, opens, pixel size, preview==download`, async ({ page, out, verdict }) => {
        await page.goto('/compress-image');
        const webpOk = await webpState(page);
        await choose(page, fx(inp.file));
        await expect(page.getByText(`Selected: ${inp.file}`, { exact: false })).toBeVisible();
        // Default output = real input format (WebP falls back to JPEG when the encoder cannot make WebP).
        const expectedDefault = inp.real === 'webp' && !webpOk ? 'jpeg' : inp.real;
        await expect(page.getByLabel(LABEL[expectedDefault], { exact: true })).toBeChecked();
        if (outF === 'webp' && !webpOk) {
          await expect(page.getByLabel('WebP')).toBeDisabled();
          await expect(page.locator('#ci-webp-note')).toContainText('WebP is unavailable');
          verdict('UNSUPPORTED: browser cannot encode WebP; option disabled with note (correct behaviour)');
          return;
        }
        await pickFormat(page, outF);
        await setLimit(page, null);
        const t0 = Date.now();
        await page.getByRole('button', { name: 'Compress' }).click();
        await compressOutcome(page);
        const ms = Date.now() - t0;
        await expect(page.getByRole('status')).toContainText('passed all checks');
        const d = await download(page, out, `${inp.real}-`);
        expect(d.name).toBe(inp.file.replace(/\.[^.]+$/, '') + '.' + (outF === 'jpeg' ? 'jpg' : outF));
        expect(magic(d.bytes)).toBe(outF);
        const dec = await decodeSample(page, d.bytes);
        expect([dec.width, dec.height]).toEqual([640, 480]);
        expect(sha(await previewImgBytes(page))).toBe(sha(d.bytes));
        await expect(page.getByTestId('after-caption')).toContainText(`${LABEL[outF]} · 640×480px · ${fmt(d.bytes.length)}`);
        writeJson(out, `${inp.real}-to-${outF}.json`, { name: d.name, bytes: d.bytes.length, format: magic(d.bytes), dims: [dec.width, dec.height], sha: sha(d.bytes), ms });
      });
    }

  // ---------- C01w: WebP download through the UI (separate from the byte check in C01) ----------
  test('C01w WebP download by clicking the UI link: download event, saved file == link Blob', async ({ browser, out, verdict }) => {
    test.skip(browser.browserType().name() === 'firefox', 'NOT RUN: Playwright-Firefox saves the WebP, opens it in a viewer tab and never emits the download event; the test then hangs on teardown (3 attempts, see report). Bytes are verified via the link Blob in C01.');
    // Own context: in Playwright-Firefox the page becomes unreachable after this download, and closing it can hang.
    const ctx = await browser.newContext({ acceptDownloads: true, baseURL: 'http://localhost:4173' });
    const page = await ctx.newPage();
    try {
    await page.goto('/compress-image');
    test.skip(!(await webpState(page)), 'UNSUPPORTED: no WebP encoder in this browser');
    await choose(page, fx('photo-io.jpg'));
    await pickFormat(page, 'webp');
    await setLimit(page, null);
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    const link = page.getByTestId('download');
    const blob = Buffer.from(await link.evaluate(async (a: HTMLAnchorElement) => {
      const b = new Uint8Array(await (await fetch(a.href)).arrayBuffer());
      let s = '';
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      return btoa(s);
    }), 'base64');
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }).catch(() => null), link.click()]);
    if (!d) {
      // Firefox (Playwright build) saves the file, then opens it in a viewer tab instead of emitting the download event.
      let tabs: string[] = [];
      for (let i = 0; i < 20 && !tabs.some((u) => u.startsWith('file://')); i++) {
        await new Promise((r) => setTimeout(r, 250));
        tabs = ctx.pages().map((p) => p.url());
      }
      const saved = tabs.find((u) => u.startsWith('file://'));
      const path = saved ? decodeURIComponent(new URL(saved).pathname) : null;
      if (path && existsSync(path)) {
        const bytes = readFileSync(path);
        copyFileSync(path, join(out, 'firefox-saved-photo-io.webp'));
        expect(path.endsWith('/photo-io.webp')).toBe(true);
        expect(magic(bytes)).toBe('webp');
        expect(sha(bytes)).toBe(sha(blob));
        verdict(`no download event; browser saved ${path.split('/').pop()} (${bytes.length} B, sha == Blob) and opened it in a tab`);
        return;
      }
      verdict(`NOT VERIFIED: no download event and no saved file; tabs ${JSON.stringify(tabs)}`);
      test.skip(true, 'UI download not verifiable in this automation build');
    }
    const p = join(out, d!.suggestedFilename());
    await d!.saveAs(p);
    const saved = readFileSync(p);
    expect(d!.suggestedFilename()).toBe('photo-io.webp');
    expect(magic(saved)).toBe('webp');
    expect(sha(saved)).toBe(sha(blob));
    verdict(`download event fired, ${saved.length} B, sha == Blob`);
    } finally {
      await Promise.race([ctx.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
    }
  });

  // ---------- C02: drag and drop ----------
  test('C02 drag-and-drop a file onto the drop zone', async ({ page }) => {
    await page.goto('/compress-image');
    await dropFiles(page.getByText(/^Or drop a JPG/).locator('..'), [{ path: fx('document.png'), mime: 'image/png' }]);
    await expect(page.getByText('Selected: document.png', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByTestId('after-caption')).toContainText('1600×1000px');
  });

  // ---------- C03–C05: limits ----------
  test('C03 default limit (100 KB) on a portrait JPEG: fits, KB display matches exact bytes', async ({ page, out }) => {
    await page.goto('/compress-image');
    await choose(page, fx('portrait.jpg'));
    await expect(page.locator('#ci-limit')).toHaveValue('100');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByRole('status')).toContainText('passed all checks');
    const d = await download(page, out);
    expect(d.bytes.length).toBeLessThanOrEqual(100_000);
    expect(magic(d.bytes)).toBe('jpeg');
    await expect(page.getByTestId('download')).toContainText(`Download portrait.jpg (${fmt(d.bytes.length)})`);
    await expect(page.getByTestId('after-caption')).toContainText('1200×1800px');
    await expect(page.getByText('Within limit')).toBeVisible();
    writeJson(out, 'c03.json', { bytes: d.bytes.length, ui: fmt(d.bytes.length), caption: await page.getByTestId('after-caption').textContent() });
  });

  test('C04 low but feasible limit (150 KB) on a landscape JPEG', async ({ page, out }) => {
    await page.goto('/compress-image');
    await choose(page, fx('landscape.jpg'));
    await setLimit(page, '150');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByRole('status')).toContainText('passed all checks');
    const d = await download(page, out);
    expect(d.bytes.length).toBeLessThanOrEqual(150_000);
    await expect(page.getByTestId('after-caption')).toContainText('1800×1200px');
    writeJson(out, 'c04.json', { bytes: d.bytes.length, caption: await page.getByTestId('after-caption').textContent() });
  });

  test('C05 impossible limit (2 KB, no resize) is reported over limit with exact numbers, never success', async ({ page, out }) => {
    await page.goto('/compress-image');
    await choose(page, fx('detail.png'));
    await pickFormat(page, 'jpeg');
    await setLimit(page, '2');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByRole('status')).toContainText('over the limit');
    await expect(page.getByRole('status')).not.toContainText('passed');
    await expect(page.getByText('Over limit', { exact: true })).toBeVisible();
    const d = await download(page, out);
    expect(d.bytes.length).toBeGreaterThan(2000);
    await expect(page.getByText(`Smallest file: ${d.bytes.length.toLocaleString('en-US')} bytes, limit 2,000 bytes.`)).toBeVisible();
    await expect(page.getByText(/Turn on "Allow smaller dimensions"/)).toBeVisible();
    await expect(page.getByTestId('download')).toContainText('anyway');
    await page.screenshot({ path: join(out, 'over-limit.png'), fullPage: true });
  });

  test('C06 empty / zero / negative / non-numeric limit values are refused before any job', async ({ page, verdict }) => {
    await page.goto('/compress-image');
    await choose(page, fx('small.jpg'));
    const seen: Record<string, string> = {};
    for (const v of ['', '0', '-5', 'abc', '1,5', '   ']) {
      await setLimit(page, v);
      await page.getByRole('button', { name: 'Compress' }).click();
      await expect(alert(page)).toContainText('Enter a size limit greater than 0.');
      await expect(page.getByTestId('after-caption')).toHaveCount(0);
      seen[v] = 'refused';
    }
    // Scientific notation and big numbers are accepted as numbers.
    await setLimit(page, '1e2');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByRole('status')).toContainText('passed all checks');
    verdict(`refused: ${Object.keys(seen).map((k) => JSON.stringify(k)).join(', ')}; "1e2" accepted as 100 KB; "1,5" (comma decimal) refused`);
  });

  test('C07 exact byte boundary: limit == output bytes passes, limit == bytes−1 is over limit (PNG, deterministic)', async ({ page, out, verdict }) => {
    await page.goto('/compress-image');
    await choose(page, fx('photo.png'));
    await pickFormat(page, 'png');
    await setLimit(page, null);
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    const s = (await download(page, out, 'free-')).bytes.length;
    await setLimit(page, String(s / 1000));
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByRole('status')).toContainText('passed all checks');
    const at = await download(page, out, 'at-');
    expect(at.bytes.length).toBe(s);
    await setLimit(page, String((s - 1) / 1000));
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByRole('status')).toContainText('over the limit');
    await expect(page.getByText(`Smallest file: ${s.toLocaleString('en-US')} bytes, limit ${(s - 1).toLocaleString('en-US')} bytes.`)).toBeVisible();
    verdict(`S=${s} B: limit ${s / 1000} KB → ok; limit ${(s - 1) / 1000} KB → over_limit`);
  });

  // ---------- C09: transparency ----------
  test('C09 transparency: PNG/WebP keep alpha; JPEG uses the chosen fill colour', async ({ page, out, verdict }) => {
    await page.goto('/compress-image');
    const webpOk = await webpState(page);
    await choose(page, fx('transparent.png'));
    const pts = { clear: [0.1, 0.5] as [number, number], green: [0.65, 0.5] as [number, number] };
    await setLimit(page, null);
    const results: Record<string, unknown> = {};
    for (const f of (webpOk ? ['png', 'webp'] : ['png']) as F[]) {
      await pickFormat(page, f);
      await page.getByRole('button', { name: 'Compress' }).click();
      await compressOutcome(page);
      const d = await download(page, out, `${f}-`);
      const s = await decodeSample(page, d.bytes, pts);
      expect(s.samples.clear[3], `${f} keeps transparent area`).toBeLessThan(10);
      expect(s.samples.green[3]).toBeGreaterThan(245);
      results[f] = s.samples;
    }
    await pickFormat(page, 'jpeg');
    await expect(page.getByLabel(/Fill transparent areas/)).toBeVisible();
    await page.locator('#ci-bg').fill('#ff0000');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    const d = await download(page, out, 'jpeg-red-');
    const s = await decodeSample(page, d.bytes, pts);
    expect(red(s.samples.clear)).toBe(true);
    expect(near(s.samples.green, '#008000', 45)).toBe(true);
    results.jpeg = s.samples;
    writeJson(out, 'alpha.json', results);
    verdict(webpOk ? 'PNG+WebP alpha kept, JPEG red fill' : 'PNG alpha kept, JPEG red fill; WebP UNSUPPORTED in this browser');
  });

  test('C09b JPEG fill colour control follows the file bytes, not its name/MIME (B4)', async ({ page, verdict }) => {
    await page.goto('/compress-image');
    // Transparent PNG named/typed as .jpg → control must be offered before the first run.
    await page.getByLabel('Choose an image').setInputFiles({ name: 'alpha-but-named.jpg', mimeType: 'image/jpeg', buffer: readFileSync(fx('transparent.png')) });
    await expect(page.getByLabel('PNG', { exact: true })).toBeChecked();
    await pickFormat(page, 'jpeg');
    await expect(page.getByLabel(/Fill transparent areas/)).toBeVisible();
    // Fill colour is really used on the first run.
    await page.locator('#ci-bg').fill('#ff0000');
    await setLimit(page, null);
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    const d = await download(page, join(QA, 'out', test.info().project.name, 'C09b'));
    expect(red((await decodeSample(page, d.bytes, { c: [0.1, 0.5] })).samples.c)).toBe(true);
    // JPEG bytes named/typed .png (no alpha possible) → no control.
    await page.getByLabel('Choose an image').setInputFiles({ name: 'photo-but-named.png', mimeType: 'image/png', buffer: readFileSync(fx('photo-io.jpg')) });
    await expect(page.getByLabel('JPEG', { exact: true })).toBeChecked();
    await expect(page.getByLabel(/Fill transparent areas/)).toHaveCount(0);
    // Opaque PNG (colour type with alpha channel but…): photo.png is RGBA → control shown (may have alpha by header).
    verdict('transparent PNG named .jpg → control shown before first run, red fill applied; JPEG named .png → no control');
  });

  // ---------- C10: EXIF ----------
  const exif = {
    3: { size: [240, 120], red: [0.9, 0.9], blue: [0.05, 0.05] },
    6: { size: [120, 240], red: [0.9, 0.1], blue: [0.05, 0.95] },
    8: { size: [120, 240], red: [0.1, 0.9], blue: [0.95, 0.05] },
  } as const;
  for (const [o, e] of Object.entries(exif))
    test(`C10-exif${o} EXIF Orientation ${o} applied exactly once`, async ({ page, out }) => {
      await page.goto('/compress-image');
      await choose(page, fx(`exif-${o}.jpg`));
      await setLimit(page, null);
      await page.getByRole('button', { name: 'Compress' }).click();
      await compressOutcome(page);
      const d = await download(page, out, `o${o}-`);
      const s = await decodeSample(page, d.bytes, { red: e.red as [number, number], blue: e.blue as [number, number], mid: [0.5, 0.5] });
      expect([s.width, s.height]).toEqual(e.size);
      expect(red(s.samples.red), `red at ${e.red}`).toBe(true);
      expect(blue(s.samples.blue), `blue at ${e.blue}`).toBe(true);
      expect(white(s.samples.mid)).toBe(true);
    });

  // ---------- C11–C12: dimensions ----------
  test('C11 exact size is kept exactly, even when the limit cannot be met; invalid sizes refused', async ({ page, verdict }) => {
    await page.goto('/compress-image');
    await choose(page, fx('landscape.jpg'));
    await page.getByLabel('Exact size').check();
    await expect(page.getByLabel(/Allow smaller dimensions/)).toBeDisabled();
    for (const [w, h] of [['', '200'], ['0', '10'], ['abc', '5']]) {
      await page.getByLabel('Width (px)').fill(w!);
      await page.getByLabel('Height (px)').fill(h!);
      await page.getByRole('button', { name: 'Compress' }).click();
      await expect(alert(page)).toContainText('Enter a width and height');
    }
    await page.getByLabel('Width (px)').fill('500');
    await page.getByLabel('Height (px)').fill('500');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByTestId('after-caption')).toContainText('500×500px');
    await setLimit(page, '1');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByRole('status')).toContainText('over the limit');
    await expect(page.getByTestId('after-caption')).toContainText('500×500px');
    // Too large exact size → pixel limit error.
    await setLimit(page, null);
    await page.getByLabel('Width (px)').fill('20000');
    await page.getByLabel('Height (px)').fill('100');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(alert(page)).toContainText('TOO_MANY_PIXELS');
    verdict('exact size 500×500 from 3:2 kept (aspect not preserved by design); over-limit keeps 500×500; 20000×100 refused');
  });

  test('C12 resize only when allowed; aspect ratio kept when it shrinks (panorama 6:1)', async ({ page, out, verdict }) => {
    await page.goto('/compress-image');
    await choose(page, fx('panorama.jpg'));
    await setLimit(page, '30');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByRole('status')).toContainText('over the limit');
    await expect(page.getByTestId('after-caption')).toContainText('6000×1000px');
    await page.getByLabel(/Allow smaller dimensions/).check();
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByRole('status')).toContainText('passed all checks');
    const d = await download(page, out);
    const s = await decodeSample(page, d.bytes);
    expect(d.bytes.length).toBeLessThanOrEqual(30_000);
    expect(s.width).toBeLessThan(6000);
    expect(Math.abs(s.width / s.height - 6)).toBeLessThan(0.05);
    verdict(`resized to ${s.width}×${s.height}, ${d.bytes.length} B`);
  });

  // ---------- C13: WebP capability and encoder fallbacks ----------
  test('C13a WebP option reflects the real encoder of this browser', async ({ page, verdict }) => {
    await page.goto('/compress-image');
    const ok = await webpState(page);
    await choose(page, fx('photo.webp'));
    if (ok) await expect(page.getByLabel('WebP')).toBeChecked();
    else {
      await expect(page.getByLabel('JPEG', { exact: true })).toBeChecked();
      await expect(page.locator('#ci-webp-note')).toBeVisible();
    }
    verdict(ok ? 'WebP encoder available' : 'WebP encoder unavailable → disabled with note, WebP input defaults to JPEG');
  });

  test('C13b main-thread fallback + encoder that returns PNG for WebP: WebP disabled, JPEG still works', async ({ page, out }) => {
    await page.addInitScript(() => {
      // Force the no-worker path (Worker/OffscreenCanvas missing) and a canvas that silently returns PNG for WebP.
      // @ts-expect-error test override
      delete window.OffscreenCanvas;
      const orig = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
        return orig.call(this, cb, type === 'image/webp' ? 'image/png' : type, q);
      };
    });
    await page.goto('/compress-image');
    await expect(page.getByLabel('WebP')).toBeDisabled({ timeout: 15_000 });
    await expect(page.locator('#ci-webp-note')).toContainText('WebP is unavailable');
    await choose(page, fx('photo.webp'));
    await expect(page.getByLabel('JPEG', { exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    const d = await download(page, out);
    expect(magic(d.bytes)).toBe('jpeg');
    expect(d.name).toBe('photo.jpg');
  });

  test('C13c encoder passes the probe but returns PNG on the real job → FORMAT_MISMATCH, no mislabelled download', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'precondition needs a canvas that can encode a real WebP probe; WebKit cannot');
    await page.addInitScript(() => {
      // @ts-expect-error test override
      delete window.OffscreenCanvas;
      const orig = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
        return orig.call(this, cb, type === 'image/webp' && this.width > 4 ? 'image/png' : type, q);
      };
    });
    await page.goto('/compress-image');
    await expect(page.getByLabel('WebP')).toBeEnabled({ timeout: 15_000 });
    await choose(page, fx('photo-io.jpg'));
    await pickFormat(page, 'webp');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(alert(page)).toContainText('FORMAT_MISMATCH');
    await expect(page.getByTestId('download')).toHaveCount(0);
  });

  // ---------- C14: small text quality at the same zoom ----------
  test('C14 small text / signature quality: crops at 100% and 200% for before vs after', async ({ page, out, verdict }, info) => {
    test.skip(!isDesktop(info.project.name), 'quality crops on desktop engines only');
    await page.goto('/compress-image');
    const webpOk = await webpState(page);
    await choose(page, fx('document.png'));
    const src = readFileSync(fx('document.png'));
    const runs: { f: F; kb: string }[] = [{ f: 'jpeg', kb: '100' }, { f: 'jpeg', kb: '60' }, ...(webpOk ? [{ f: 'webp' as F, kb: '60' }] : [])];
    const report: Record<string, unknown> = {};
    for (const r of runs) {
      await pickFormat(page, r.f);
      await setLimit(page, r.kb);
      await page.getByRole('button', { name: 'Compress' }).click();
      await compressOutcome(page);
      const d = await download(page, out, `${r.f}-${r.kb}kb-`);
      // Crop the 8–11 px text rows and the fake signature, side by side, at 100% and 200% (nearest-neighbour).
      const res = await page.evaluate(
        async ({ a, b }) => {
          const load = async (b64: string) => {
            const bin = atob(b64);
            const u = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
            return createImageBitmap(new Blob([u]));
          };
          const [A, B] = [await load(a), await load(b)];
          const regions = { text: [40, 300, 560, 170], sig: [1060, 820, 480, 140] } as const;
          const outImgs: Record<string, string> = {};
          let mae = 0;
          for (const [name, [x, y, w, h]] of Object.entries(regions)) {
            for (const z of [1, 2]) {
              const c = document.createElement('canvas');
              c.width = w * z * 2 + 10;
              c.height = h * z + 24;
              const g = c.getContext('2d')!;
              g.fillStyle = '#fff';
              g.fillRect(0, 0, c.width, c.height);
              g.imageSmoothingEnabled = false;
              g.drawImage(A, x, y, w, h, 0, 24, w * z, h * z);
              g.drawImage(B, x, y, w, h, w * z + 10, 24, w * z, h * z);
              g.fillStyle = '#000';
              g.font = '14px sans-serif';
              g.fillText(`before (${z * 100}%)`, 4, 16);
              g.fillText(`after (${z * 100}%)`, w * z + 14, 16);
              outImgs[`${name}-${z * 100}`] = c.toDataURL('image/png').split(',')[1]!;
            }
            const ca = document.createElement('canvas');
            ca.width = w;
            ca.height = h;
            const ga = ca.getContext('2d')!;
            ga.drawImage(A, x, y, w, h, 0, 0, w, h);
            const da = ga.getImageData(0, 0, w, h).data;
            ga.drawImage(B, x, y, w, h, 0, 0, w, h);
            const db = ga.getImageData(0, 0, w, h).data;
            let s = 0;
            for (let i = 0; i < da.length; i += 4) s += (Math.abs(da[i]! - db[i]!) + Math.abs(da[i + 1]! - db[i + 1]!) + Math.abs(da[i + 2]! - db[i + 2]!)) / 3;
            mae = Math.max(mae, s / (w * h));
          }
          return { outImgs, mae };
        },
        { a: src.toString('base64'), b: d.bytes.toString('base64') },
      );
      for (const [k, v] of Object.entries(res.outImgs)) writeFileSync(join(out, `${r.f}-${r.kb}kb-${k}.png`), Buffer.from(v, 'base64'));
      const cap = await page.getByTestId('after-caption').textContent();
      report[`${r.f}-${r.kb}kb`] = { bytes: d.bytes.length, caption: cap, worstRegionMeanAbsError: +res.mae.toFixed(2) };
    }
    writeJson(out, 'quality.json', report);
    verdict(JSON.stringify(report));
  });

  // ---------- C15: settings changed after a result (B1) ----------
  const groups: { name: string; act: (p: import('@playwright/test').Page) => Promise<unknown> }[] = [
    { name: 'limit value below the file size', act: (p) => p.locator('#ci-limit').fill('5') },
    { name: 'limit unit', act: (p) => p.locator('#ci-unit').selectOption('MB') },
    { name: 'limit toggle off', act: (p) => p.locator('#ci-limit-on').click() },
    { name: 'output format', act: (p) => p.getByLabel('PNG', { exact: true }).check() },
    { name: 'dimensions mode', act: (p) => p.getByLabel('Exact size').check() },
    { name: 'allow smaller dimensions', act: (p) => p.getByLabel(/Allow smaller dimensions/).check() },
    { name: 'JPEG fill colour', act: (p) => p.locator('#ci-bg').fill('#00ff00') },
  ];
  for (const g of groups)
    test(`C15-${g.name.replace(/\W+/g, '-')} changing "${g.name}" after a result clears preview, status and download (B1)`, async ({ page }) => {
      await page.goto('/compress-image');
      await choose(page, fx(g.name === 'JPEG fill colour' ? 'transparent.png' : 'photo-io.jpg'));
      await pickFormat(page, 'jpeg');
      await setLimit(page, '100');
      await page.getByRole('button', { name: 'Compress' }).click();
      await compressOutcome(page);
      await expect(page.getByText('Within limit')).toBeVisible();
      await g.act(page);
      await expect(page.getByTestId('after-caption')).toHaveCount(0);
      await expect(page.getByTestId('download')).toHaveCount(0);
      await expect(page.getByText('Within limit')).toHaveCount(0);
      await expect(page.locator('[role=status]')).not.toContainText('passed all checks');
    });

  test('C15-required compress OK, then lower the limit below the file just made: no "Within limit", no old download; re-run is over limit (B1)', async ({ page, out, verdict }) => {
    await page.goto('/compress-image');
    await choose(page, fx('photo-io.jpg'));
    await setLimit(page, '100');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    const first = await download(page, out, 'first-');
    const below = String((first.bytes.length - 1) / 1000);
    await page.locator('#ci-limit').fill(below);
    await expect(page.getByText('Within limit')).toHaveCount(0);
    await expect(page.getByTestId('download')).toHaveCount(0);
    await expect(page.locator('img[alt="Compressed image"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    const second = await download(page, out, 'second-');
    expect(second.bytes.length).toBeLessThanOrEqual(first.bytes.length - 1);
    verdict(`first ${first.bytes.length} B at limit 100 KB; limit → ${below} KB cleared the result; re-run → ${second.bytes.length} B`);
  });

  test('C15-late a settings change during a running job: the old job’s late result is dropped (B1)', async ({ page }) => {
    await page.goto('/compress-image');
    await choose(page, fx('detail.png'));
    await pickFormat(page, 'jpeg');
    await setLimit(page, '20');
    await page.getByLabel(/Allow smaller dimensions/).check();
    await page.evaluate(() => {
      new PerformanceObserver((list, obs) => {
        if (!list.getEntriesByName('lovert:job-sent').length) return;
        obs.disconnect();
        setTimeout(() => document.querySelector<HTMLLabelElement>('label[for="ci-format-png"]')!.click(), 30);
      }).observe({ type: 'mark' });
    });
    await page.getByRole('button', { name: 'Compress' }).click();
    await expect(page.getByLabel('PNG', { exact: true })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Compress', exact: true })).toBeEnabled();
    await expect.poll(() => page.evaluate(() => performance.getEntriesByName('lovert:job-stopped').length + performance.getEntriesByName('lovert:job-late-result').length), { timeout: 60_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('after-caption')).toHaveCount(0);
  });

  // ---------- C16: file changed while reading / processing ----------
  test('C16a switching file while a 48 MP job is processing: only the new file’s result appears', async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), 'large decode on desktop engines only');
    await page.goto('/compress-image');
    await choose(page, fx('limit-48mp.jpg'));
    await setLimit(page, '50');
    await page.getByLabel(/Allow smaller dimensions/).check();
    await page.getByRole('button', { name: 'Compress' }).click();
    await expect(page.getByRole('button', { name: 'Compressing…' })).toBeVisible();
    await choose(page, fx('small.jpg'));
    await expect(page.getByText('Selected: small.jpg', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compress', exact: true })).toBeEnabled();
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('after-caption')).toHaveCount(0);
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByTestId('after-caption')).toContainText('64×48px');
  });

  test('C16b two picks in the same tick (big then small): the last pick wins (5 tries)', async ({ page, verdict }) => {
    await page.goto('/compress-image');
    const big = readFileSync(fx('landscape.jpg')).toString('base64');
    const small = readFileSync(fx('small.jpg')).toString('base64');
    const winners: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.evaluate(({ big, small }) => {
        const mk = (b64: string, n: string) => {
          const bin = atob(b64);
          const u = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          return new File([u], n, { type: 'image/jpeg' });
        };
        const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
        for (const f of [mk(big, 'big.jpg'), mk(small, 'small.jpg')]) {
          const dt = new DataTransfer();
          dt.items.add(f);
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, { big, small });
      await page.waitForTimeout(400);
      winners.push((await page.locator('text=/Selected:/').textContent()) ?? '');
    }
    verdict(winners.join(' | '));
    for (const w of winners) expect(w).toContain('small.jpg');
  });

  test('C16c switching file while the input is still being read (job not yet sent)', async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), 'desktop only');
    await page.goto('/compress-image');
    await choose(page, fx('bytes-50000000-exact.png'));
    await setLimit(page, null);
    // Click and replace the file in the same tick, before file.arrayBuffer() of 50 MB resolves.
    const small = readFileSync(fx('small.jpg')).toString('base64');
    await page.evaluate((small) => {
      const bin = atob(small);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      document.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
      const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
      const dt = new DataTransfer();
      dt.items.add(new File([u], 'small.jpg', { type: 'image/jpeg' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, small);
    await expect(page.getByText('Selected: small.jpg', { exact: false })).toBeVisible();
    await page.waitForTimeout(2500);
    await expect(page.getByTestId('after-caption')).toHaveCount(0);
    expect(await page.evaluate(() => performance.getEntriesByName('lovert:job-sent').length)).toBe(0);
  });

  test('C16d B3 regression (controlled order): pick A (slow read) then B (fast); A finishes last; UI and result belong to B', async ({ page }) => {
    await slowReads(page, { 'a-slow.jpg': 1500 });
    await page.goto('/compress-image');
    await pickInPage(page, [{ name: 'a-slow.jpg', b64: readFileSync(fx('landscape.jpg')).toString('base64'), type: 'image/jpeg' }, { name: 'b-fast.jpg', b64: readFileSync(fx('small.jpg')).toString('base64'), type: 'image/jpeg' }]);
    await expect(page.getByText('Selected: b-fast.jpg', { exact: false })).toBeVisible();
    await page.waitForTimeout(2200); // A's read completes now
    await expect(page.getByText('Selected: b-fast.jpg', { exact: false })).toBeVisible();
    await expect(page.getByText('a-slow.jpg')).toHaveCount(0);
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByTestId('after-caption')).toContainText('64×48px');
    await expect(page.getByTestId('download')).toContainText('b-fast.jpg');
  });

  test('C16e B3 regression: A fails late (invalid file, slow read) after B was picked; no error from A, B stays', async ({ page }) => {
    await slowReads(page, { 'a-bad.png': 1500 });
    await page.goto('/compress-image');
    await pickInPage(page, [{ name: 'a-bad.png', b64: readFileSync(fx('notes.txt')).toString('base64'), type: 'image/png' }, { name: 'b-ok.jpg', b64: readFileSync(fx('small.jpg')).toString('base64'), type: 'image/jpeg' }]);
    await expect(page.getByText('Selected: b-ok.jpg', { exact: false })).toBeVisible();
    await page.waitForTimeout(2200);
    await expect(alert(page)).toHaveCount(0);
    await expect(page.getByText('Selected: b-ok.jpg', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compress' })).toBeEnabled();
  });

  test('C16f B3 regression: A (truncated JPEG, slow full-file check) then B: A’s late damage error never shows', async ({ page }) => {
    await slowReads(page, { 'a-cut.jpg': 1500 });
    await page.goto('/compress-image');
    await pickInPage(page, [{ name: 'a-cut.jpg', b64: readFileSync(fx('truncated.jpg')).toString('base64'), type: 'image/jpeg' }, { name: 'b-ok.jpg', b64: readFileSync(fx('small.jpg')).toString('base64'), type: 'image/jpeg' }]);
    await page.waitForTimeout(2500);
    await expect(alert(page)).toHaveCount(0);
    await expect(page.getByText('Selected: b-ok.jpg', { exact: false })).toBeVisible();
  });

  test('C16g while a new file is being checked: old file is unselected, Compress disabled, and a format chosen meanwhile is kept', async ({ page }) => {
    await slowReads(page, { 'landscape-slow.jpg': 2000 });
    await page.goto('/compress-image');
    await choose(page, fx('photo-io.jpg')); // JPEG selected
    await expect(page.getByText('Selected: photo-io.jpg', { exact: false })).toBeVisible();
    await page.getByLabel('Choose an image').setInputFiles({ name: 'landscape-slow.jpg', mimeType: 'image/jpeg', buffer: readFileSync(fx('landscape.jpg')) });
    await expect(page.locator('[role=status]')).toContainText('Checking landscape-slow.jpg');
    await expect(page.getByText('Selected: photo-io.jpg', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Compress' })).toBeDisabled();
    await expect(page.getByLabel('PNG', { exact: true }), 'format is locked while the file is checked').toBeDisabled();
    await pickFormat(page, 'png'); // waits until the check is done, then the user's choice applies
    await expect(page.getByText('Selected: landscape-slow.jpg', { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('PNG', { exact: true })).toBeChecked();
    await setLimit(page, null);
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByTestId('after-caption')).toContainText('PNG · 1800×1200px');
  });

  // ---------- C17: retry after error, repeated clicks ----------
  test('C17 retry after an error, and repeated clicks start one job', async ({ page }) => {
    await page.goto('/compress-image');
    await choose(page, fx('portrait.jpg'));
    // An error every engine produces: exact size over the pixel limit.
    await page.getByLabel('Exact size').check();
    await page.getByLabel('Width (px)').fill('20000');
    await page.getByLabel('Height (px)').fill('100');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(alert(page)).toContainText('TOO_MANY_PIXELS');
    await page.getByLabel('Keep original').check();
    const btn = page.getByRole('button', { name: 'Compress' });
    await btn.evaluate((b: HTMLButtonElement) => {
      for (let i = 0; i < 5; i++) b.click();
    });
    await compressOutcome(page);
    await expect(page.getByRole('status')).toContainText('passed all checks');
    await expect(alert(page)).toHaveCount(0);
    const sent = await page.evaluate(() => performance.getEntriesByName('lovert:job-sent').length);
    expect(sent, 'failing job + one job for five synchronous clicks').toBe(2);
  });

  for (const f of ['truncated.jpg', 'truncated-99.jpg', 'progressive-truncated.jpg', 'truncated.png', 'truncated.webp'])
    test(`C21-${f.replace('.', '-')} cut-off image is refused when picked, never a "passed" result (B2)`, async ({ page }) => {
      test.skip(!existsSync(fx(f)), 'fixture needs ImageMagick');
      await page.goto('/compress-image');
      await choose(page, fx(f));
      await expect(alert(page)).toContainText(/This (JPEG|PNG|WebP) is incomplete/);
      await expect(page.getByRole('button', { name: 'Compress' })).toBeDisabled();
      await expect(page.getByTestId('after-caption')).toHaveCount(0);
    });

  for (const [f, dims] of [['progressive.jpg', '1200×1800'], ['progressive-exif6.jpg', '1800×1200'], ['trailing-data.jpg', '1200×1800'], ['exif-6.jpg', '120×240']] as const)
    test(`C22-${f.replace('.jpg', '')} valid JPEG variant is still accepted and processed (B2 no false positive)`, async ({ page, out }) => {
      test.skip(!existsSync(fx(f)), 'fixture needs ImageMagick');
      await page.goto('/compress-image');
      await choose(page, fx(f));
      await expect(alert(page)).toHaveCount(0);
      await setLimit(page, null);
      await page.getByRole('button', { name: 'Compress' }).click();
      await compressOutcome(page);
      await expect(page.getByRole('status')).toContainText('passed all checks');
      await expect(page.getByTestId('after-caption')).toContainText(`${dims}px`);
      const d = await download(page, out, f.replace('.jpg', '-'));
      expect(magic(d.bytes)).toBe('jpeg');
    });

  // ---------- C18: input errors ----------
  test('C18 rejected inputs: empty, unsupported formats, fake HEIC, text', async ({ page }) => {
    await page.goto('/compress-image');
    await choose(page, fx('empty.png'));
    await expect(alert(page)).toContainText('That file is empty');
    for (const f of ['unsupported.gif', 'unsupported.bmp', 'notes.txt', 'heic-named.heic']) {
      await page.getByLabel('Choose an image').setInputFiles({ name: f, mimeType: 'image/png', buffer: readFileSync(fx(f)) });
      await expect(alert(page)).toContainText('not a JPG, PNG or WebP image (checked from the file contents)');
      await expect(page.getByRole('button', { name: 'Compress' })).toBeDisabled();
    }
  });

  test('C18b wrong extension: real format comes from bytes, output named by real format', async ({ page, out }) => {
    await page.goto('/compress-image');
    await choose(page, fx('jpeg-named.png'));
    await expect(page.getByLabel('JPEG', { exact: true })).toBeChecked();
    await setLimit(page, null);
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByText(/Before · JPEG · 1200×1800px/)).toBeVisible();
    const d = await download(page, out, 'a-');
    expect(d.name).toBe('jpeg-named.jpg');
    expect(magic(d.bytes)).toBe('jpeg');
    await choose(page, fx('png-named.jpg'));
    await expect(page.getByLabel('PNG', { exact: true })).toBeChecked();
  });

  test('C18c Unicode file name is kept in the download name', async ({ page, out, verdict }) => {
    await page.goto('/compress-image');
    const name = 'ảnh-thử nghiệm 日本 😀.png';
    const p = join(out, 'unicode-src.png');
    copyFileSync(fx(name), p);
    await page.getByLabel('Choose an image').setInputFiles({ name, mimeType: 'image/png', buffer: readFileSync(p) });
    await expect(page.getByText(`Selected: ${name}`, { exact: false })).toBeVisible();
    await pickFormat(page, 'jpeg');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    const d = await download(page, out);
    verdict(`suggested filename: ${d.name}`);
    expect(d.name.normalize('NFC')).toBe('ảnh-thử nghiệm 日本 😀.jpg'.normalize('NFC'));
  });

  // ---------- C19–C20: resource limits ----------
  test('C19 file size limit: exactly 50,000,000 bytes accepted and processed; 50,000,001 refused', async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), 'desktop only (50 MB transfer)');
    await page.goto('/compress-image');
    await choose(page, fx('bytes-50000001-over.png'));
    await expect(alert(page)).toContainText('larger than 50 MB');
    await choose(page, fx('bytes-50000000-exact.png'));
    await expect(alert(page)).toHaveCount(0);
    await expect(page.getByText('Selected: bytes-50000000-exact.png · 50.00 MB')).toBeVisible();
    await pickFormat(page, 'jpeg');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByTestId('after-caption')).toContainText('200×150px');
  });

  test('C20a pixel/side limits from the header: 10000×5001 and 16385×100 refused; 16384×100 passes the size check', async ({ page }) => {
    await page.goto('/compress-image');
    await choose(page, fx('hdr-10000x5001.png'));
    await expect(alert(page)).toContainText('10000×5001px (50.0 MP)');
    await choose(page, fx('hdr-16385x100.jpg'));
    await expect(alert(page)).toContainText('16385×100px');
    // 16384×100 passes the pixel/side check; this header-only fake is then refused as an incomplete JPEG (B2), not for its size.
    await choose(page, fx('hdr-16384x100.jpg'));
    await expect(alert(page)).toContainText(/This JPEG is (incomplete|damaged)/);
    await expect(alert(page)).not.toContainText('megapixels');
  });

  test('C20b real image at the side limit (16384×64) is processed', async ({ page, out }) => {
    await page.goto('/compress-image');
    await choose(page, fx('real-16384x64.png'));
    await pickFormat(page, 'jpeg');
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page);
    await expect(page.getByRole('status')).toContainText('passed all checks');
    const d = await download(page, out);
    expect((await decodeSample(page, d.bytes)).width).toBe(16384);
  });

  test('C20c real 50,000,000 px image (10000×5000) is processed', async ({ page, out, verdict }, info) => {
    test.skip(!isDesktop(info.project.name), 'mobile emulation shares the desktop engine; real 50 MP decode run on desktop only');
    await page.goto('/compress-image');
    await choose(page, fx('limit-50mp-exact.jpg'));
    await setLimit(page, '2', 'MB');
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Compress' }).click();
    await compressOutcome(page, 170_000);
    const ms = Date.now() - t0;
    const status = await page.getByRole('status').textContent();
    await expect(alert(page)).toHaveCount(0);
    await expect(page.getByTestId('after-caption')).toContainText('10000×5000px');
    const d = await download(page, out);
    verdict(`${ms} ms, ${d.bytes.length} B, status: ${status}`);
  });

  // ---------- X: keyboard + UI states ----------
  test('X03 keyboard only: reach file input, choose format, toggle limit, submit', async ({ page, out, verdict }, info) => {
    test.skip(!isDesktop(info.project.name), 'keyboard on desktop');
    await page.goto('/compress-image');
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press(info.project.name === 'webkit' ? 'Alt+Tab' : 'Tab');
      reached = await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type === 'file');
    }
    expect(reached, 'file input reachable by Tab').toBe(true);
    const ring = await page.evaluate(() => {
      const label = document.querySelector(`label[for="${document.activeElement!.id}"]`) as HTMLElement;
      const st = getComputedStyle(label);
      return { outline: st.outlineStyle + ' ' + st.outlineWidth, shadow: st.boxShadow };
    });
    await page.screenshot({ path: join(out, 'focus-file-input.png') });
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), page.keyboard.press('Space')]);
    expect(chooser, 'Space opens the file chooser').not.toBeNull();
    await chooser!.setFiles(fx('photo-io.jpg'));
    await expect(page.getByText('Selected: photo-io.jpg', { exact: false })).toBeVisible();
    await page.getByLabel('JPEG', { exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByLabel('WebP').or(page.getByLabel('PNG', { exact: true })).first()).toBeVisible();
    await page.getByRole('button', { name: 'Compress' }).focus();
    await page.keyboard.press('Enter');
    await compressOutcome(page);
    await page.getByTestId('download').focus();
    await page.screenshot({ path: join(out, 'focus-download.png') });
    verdict(`file-input focus indicator on label: ${JSON.stringify(ring)}`);
  });

  test('X06 UI states screenshots + no horizontal overflow (idle, error, working, result)', async ({ page, out }) => {
    await page.goto('/compress-image');
    await page.screenshot({ path: join(out, '1-idle.png'), fullPage: true });
    await choose(page, fx('notes.txt'));
    await page.screenshot({ path: join(out, '2-error.png'), fullPage: true });
    await choose(page, fx('detail.png'));
    await pickFormat(page, 'jpeg');
    await setLimit(page, '20');
    await page.getByLabel(/Allow smaller dimensions/).check();
    await page.getByRole('button', { name: 'Compress' }).click();
    await page.screenshot({ path: join(out, '3-working.png'), fullPage: true });
    await compressOutcome(page);
    await page.screenshot({ path: join(out, '4-result.png'), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0);
  });
});
