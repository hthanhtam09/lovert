/**
 * The six image format converters: route-specific contract cases. One parameterised suite (shared pipeline),
 * but every route gets its own fixtures, tags and assertions. Shared matrix: tool-common.spec.ts.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { jpegHeaderOnly, withExifOrientation } from '../fixtures/exif';
import { alphaWebp, asymJpeg } from '../fixtures/encoded';
import { apng, makePng } from '../fixtures/png';
import { animatedWebp } from '../fixtures/webp';
import { alerts, decodePixels, downloadVia, near, pane, webpEncodeAvailable, type Payload } from './gate-helpers';

type Img = 'jpeg' | 'png' | 'webp';
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;
const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp' } as const;
const NAME = { jpeg: 'JPG', png: 'PNG', webp: 'WebP' } as const;
const MAGIC: Record<Img, (b: Buffer) => boolean> = {
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};
type RGB = [number, number, number];
const RED: RGB = [255, 0, 0];
const BLUE: RGB = [0, 0, 255];
const WHITE: RGB = [255, 255, 255];
const ORANGE: RGB = [255, 140, 0];

/** Two flat halves (opaque): large uniform areas keep lossy codecs within tolerance. */
const halvesPng = makePng(240, 120, (x) => (x < 120 ? [...ORANGE, 255] : [...BLUE, 255]) as [number, number, number, number]);
/** Left half transparent, right half red. */
const alphaPng = makePng(200, 100, (x) => (x < 100 ? [0, 0, 0, 0] : [...RED, 255]) as [number, number, number, number]);

/** Header-only images announcing 9000×6000 (54 MP): must be refused from the header, before decoding. */
function overPixels(f: Img): Buffer {
  if (f === 'jpeg') return jpegHeaderOnly(9000, 6000);
  if (f === 'png') {
    const p = makePng(1, 1, () => [0, 0, 0, 255]);
    p.writeUInt32BE(9000, 16);
    p.writeUInt32BE(6000, 20);
    return p;
  }
  const u24 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff];
  const body = Buffer.from([0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0, ...u24(8999), ...u24(5999), ...Array(64).fill(0)]);
  const head = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  head.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([head, body]);
}

interface Pair {
  slug: string;
  from: Img;
  to: Img;
}
const PAIRS: Pair[] = [
  { slug: 'png-to-jpg', from: 'png', to: 'jpeg' },
  { slug: 'jpg-to-png', from: 'jpeg', to: 'png' },
  { slug: 'png-to-webp', from: 'png', to: 'webp' },
  { slug: 'jpg-to-webp', from: 'jpeg', to: 'webp' },
  { slug: 'webp-to-png', from: 'webp', to: 'png' },
  { slug: 'webp-to-jpg', from: 'webp', to: 'jpeg' },
];

for (const p of PAIRS) {
  const T = (c: string) => `[${p.slug}:${c}]`;
  const action = `Convert to ${NAME[p.to]}`;
  const lossy = p.to !== 'png';

  async function open(page: Page, info: TestInfo) {
    await page.goto(`/${p.slug}`);
    return p.to === 'webp' ? webpEncodeAvailable(page, info, action) : true;
  }
  async function choose(page: Page, file: Payload) {
    await page.getByLabel(`Choose a ${NAME[p.from]} image`).setInputFiles(file);
    await expect(page.getByText(`Selected: ${file.name}`, { exact: false })).toBeAttached({ timeout: 30_000 });
  }
  async function convert(page: Page) {
    await pane(page, /Settings|Result/);
    await page.getByRole('button', { name: action }).click();
    await expect(page.getByRole('status')).toContainText(/passed all checks|over the limit/, { timeout: 60_000 });
    return downloadVia(page, page.getByTestId('download'));
  }
  const px = (page: Page, b: Buffer, pts: [number, number][]) => decodePixels(page, b, MIME[p.to], pts);

  test.describe(p.slug, () => {
    test(`${T('pair')} ${NAME[p.from]}→${NAME[p.to]}: magic bytes, download name, pixel size, representative pixels`, async ({ page }, info) => {
      if (!(await open(page, info))) return;
      const src: Payload =
        p.from === 'png' ? { name: 'halves.png', mimeType: MIME.png, buffer: halvesPng }
        : p.from === 'jpeg' ? { name: 'asym.jpg', mimeType: MIME.jpeg, buffer: asymJpeg }
        : { name: 'alpha.webp', mimeType: MIME.webp, buffer: alphaWebp };
      await choose(page, src);
      const out = await convert(page);
      expect(MAGIC[p.to](out.bytes), `downloaded bytes are ${NAME[p.to]}`).toBe(true);
      expect(out.name).toBe(src.name.replace(/\.\w+$/, `.${EXT[p.to]}`));
      await expect(page.getByText(`Format is ${p.to.toUpperCase()} (checked from file bytes)`)).toBeVisible();
      if (p.from === 'png') {
        const d = await px(page, out.bytes, [[0.25, 0.5], [0.75, 0.5]]);
        expect([d.width, d.height]).toEqual([240, 120]);
        expect(near(d.px[0]!, ORANGE)).toBe(true);
        expect(near(d.px[1]!, BLUE)).toBe(true);
      } else if (p.from === 'jpeg') {
        const d = await px(page, out.bytes, [[0.1, 0.1], [0.5, 0.5], [0.92, 0.92]]);
        expect([d.width, d.height]).toEqual([240, 120]);
        expect(near(d.px[0]!, RED)).toBe(true);
        expect(near(d.px[1]!, WHITE)).toBe(true);
        expect(near(d.px[2]!, BLUE)).toBe(true);
      } else {
        const d = await px(page, out.bytes, [[0.25, 0.5], [0.75, 0.5]]);
        expect([d.width, d.height]).toEqual([200, 100]);
        expect(near(d.px[1]!, RED)).toBe(true);
        if (p.to === 'jpeg') expect(near(d.px[0]!, WHITE), 'transparent area filled with the default white').toBe(true);
        else expect(d.px[0]![3], 'transparent area stays transparent').toBeLessThan(10);
      }
    });

    if (p.from !== 'jpeg') {
      test(`${T('alpha')} ${p.to === 'jpeg' ? 'transparent areas get the chosen fill colour' : 'transparency kept, opaque areas opaque'}`, async ({ page }, info) => {
        if (!(await open(page, info))) return;
        await choose(page, p.from === 'png' ? { name: 'logo.png', mimeType: MIME.png, buffer: alphaPng } : { name: 'logo.webp', mimeType: MIME.webp, buffer: alphaWebp });
        await pane(page, /Settings|Result/);
        if (p.to === 'jpeg') {
          await expect(page.getByText('This image can have transparent areas')).toBeVisible();
          await page.locator('#ci-bg').fill('#00ff00');
        }
        const out = await convert(page);
        const d = await px(page, out.bytes, [[0.2, 0.5], [0.8, 0.5]]);
        if (p.to === 'jpeg') {
          expect(near(d.px[0]!, [0, 255, 0]), 'fill colour').toBe(true);
          expect(d.px[0]![3]).toBe(255);
        } else {
          expect(d.px[0]![3], 'transparent').toBeLessThan(10);
          expect(d.px[1]![3], 'opaque').toBe(255);
        }
        expect(near(d.px[1]!, RED)).toBe(true);
      });

      test(`${T('animated')} animated ${NAME[p.from]}: warned before converting; output is the first frame`, async ({ page }, info) => {
        if (!(await open(page, info))) return;
        // APNG: frame 1 red, frame 2 blue. Animated WebP: frame 1 blue, frame 2 red.
        const file = p.from === 'png' ? { name: 'anim.png', mimeType: MIME.png, buffer: apng(120, 60, RED, BLUE) } : { name: 'anim.webp', mimeType: MIME.webp, buffer: animatedWebp() };
        const first = p.from === 'png' ? RED : BLUE;
        await choose(page, file);
        await pane(page, /Settings|Result/);
        await expect(page.getByTestId('animated-note')).toContainText(`This is an animated ${NAME[p.from]}`);
        await expect(page.getByTestId('animated-note')).toContainText('keeps only the first frame');
        await expect(page.getByTestId('download')).toHaveCount(0); // the warning comes before any output
        const out = await convert(page);
        const d = await px(page, out.bytes, [[0.5, 0.5]]);
        expect([d.width, d.height]).toEqual([120, 60]);
        expect(near(d.px[0]!, first), 'first frame kept').toBe(true);
      });
    } else {
      test(`${T('exif')} EXIF orientation 3/6/8 applied exactly once`, async ({ page }, info) => {
        if (!(await open(page, info))) return;
        const cases = {
          3: { size: [240, 120], red: [0.9, 0.85], blue: [0.05, 0.05] },
          6: { size: [120, 240], red: [0.9, 0.1], blue: [0.05, 0.92] },
          8: { size: [120, 240], red: [0.1, 0.9], blue: [0.92, 0.05] },
        } as const;
        for (const o of [3, 6, 8] as const) {
          await pane(page, 'Preview');
          await choose(page, { name: `rot${o}.jpg`, mimeType: MIME.jpeg, buffer: withExifOrientation(asymJpeg, o) });
          const out = await convert(page);
          const c = cases[o];
          const d = await px(page, out.bytes, [c.red as unknown as [number, number], c.blue as unknown as [number, number]]);
          expect([d.width, d.height], `orientation ${o} size`).toEqual(c.size);
          expect(near(d.px[0]!, RED), `orientation ${o}: red block`).toBe(true);
          expect(near(d.px[1]!, BLUE), `orientation ${o}: blue block`).toBe(true);
        }
      });
    }

    test(`${T('pixel-limit')} an image over 50 MP is refused from its header, before decoding`, async ({ page }) => {
      await page.goto(`/${p.slug}`);
      await page.getByLabel(`Choose a ${NAME[p.from]} image`).setInputFiles({ name: `huge.${EXT[p.from]}`, mimeType: MIME[p.from], buffer: overPixels(p.from) });
      await pane(page, /Settings|Result/);
      // A decode attempt would end in DECODE_FAILED; the header check names the real size instead.
      await expect(alerts(page).filter({ hasText: '9000×6000px (54.0 MP)' })).toBeVisible();
      await expect(page.getByRole('button', { name: action })).toBeDisabled();
    });

    test(`${T('limit-over')} optional size limit: numbers match the download; Adjust settings is primary`, async ({ page }, info) => {
      if (!(await open(page, info))) return;
      const src = p.from === 'png' ? { name: 'h.png', mimeType: MIME.png, buffer: halvesPng } : p.from === 'jpeg' ? { name: 'a.jpg', mimeType: MIME.jpeg, buffer: asymJpeg } : { name: 'a.webp', mimeType: MIME.webp, buffer: alphaWebp };
      await choose(page, src);
      await pane(page, /Settings|Result/);
      await page.getByLabel('Keep the file at or under a limit').check();
      await page.getByLabel('Maximum size').fill('0.1'); // 100 bytes: no real image fits
      const out = await convert(page);
      const note = page.getByTestId('over-limit');
      await expect(note).toContainText(`Smallest file: ${out.bytes.length.toLocaleString('en-US')} bytes, limit 100 bytes`);
      await expect(note).toContainText(`${(out.bytes.length - 100).toLocaleString('en-US')} bytes over`);
      // Suggestions never offer another format on a converter route.
      await expect(note).not.toContainText('Switch the output');
      if (!lossy) await expect(note).toContainText('Allow smaller dimensions');
      const adjust = page.getByRole('button', { name: 'Adjust settings' });
      await expect(adjust).toHaveAttribute('data-variant', 'default');
      await expect(page.getByTestId('download')).toContainText('anyway');
      await adjust.click();
      await expect(page.getByLabel('Maximum size')).toBeFocused();
    });

    if (p.to === 'webp') {
      test(`${T('format-mismatch')} browser returns PNG when asked for WebP: unsupported message, no .webp download`, async ({ page }) => {
        await page.addInitScript(() => {
          // @ts-expect-error test override: force the main-thread path, where the canvas encoder below is used
          delete window.Worker;
          const orig = OffscreenCanvas.prototype.convertToBlob;
          OffscreenCanvas.prototype.convertToBlob = function (o?: ImageEncodeOptions) {
            return orig.call(this, o?.type === 'image/webp' ? { ...o, type: 'image/png' } : o);
          };
          const origTo = HTMLCanvasElement.prototype.toBlob;
          HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, type?: string, q?: unknown) {
            return origTo.call(this, cb, type === 'image/webp' ? 'image/png' : type, q);
          };
        });
        await page.goto(`/${p.slug}`);
        await choose(page, p.from === 'png' ? { name: 'h.png', mimeType: MIME.png, buffer: halvesPng } : { name: 'a.jpg', mimeType: MIME.jpeg, buffer: asymJpeg });
        await pane(page, /Settings|Result/);
        await expect(alerts(page).filter({ hasText: 'WebP is unavailable' })).toBeVisible();
        await expect(page.getByRole('button', { name: action })).toBeDisabled();
        await expect(page.getByTestId('download')).toHaveCount(0);
      });
    }
  });
}

test('converter pages are readable without JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/webp-to-jpg');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Convert WebP to JPG');
  await expect(page.getByRole('heading', { name: 'What changes from WebP to JPG?' })).toBeVisible();
  await ctx.close();
});
