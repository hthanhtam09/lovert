import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, type PDFRef } from 'pdf-lib';

export const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const QA = join(ROOT, 'qa-results/two-tools');
export const FX = join(QA, 'fixtures');
export const fx = (rel: string) => join(FX, rel);
export const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** 1 KB = 1000 B, rounded up to 0.1 KB — must match core formatBytes. */
export function fmt(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1e6) return `${(Math.ceil(bytes / 100 - 1e-9) / 10).toFixed(1)} KB`;
  return `${(Math.ceil(bytes / 1e4 - 1e-9) / 100).toFixed(2)} MB`;
}

/** Every test watches the network: anything not GET/HEAD, any body, or any non-local origin is an offender. */
export const test = base.extend<{ offenders: string[]; out: string; verdict: (v: string) => void }>({
  offenders: [
    async ({ page }, use) => {
      const offenders: string[] = [];
      page.on('request', (r) => {
        const url = new URL(r.url());
        const local = url.hostname === 'localhost' || url.protocol === 'blob:' || url.protocol === 'data:';
        if (!['GET', 'HEAD'].includes(r.method()) || r.postData() || !local) offenders.push(`${r.method()} ${r.url()}`);
      });
      await use(offenders);
      expect(offenders, 'no request may carry data off the device').toEqual([]);
    },
    { auto: true },
  ],
  // eslint-disable-next-line no-empty-pattern
  out: async ({}, use, info) => {
    const dir = join(QA, 'out', info.project.name, info.title.split(' ')[0]!.replace(/[^\w-]/g, ''));
    mkdirSync(dir, { recursive: true });
    await use(dir);
  },
  // eslint-disable-next-line no-empty-pattern
  verdict: async ({}, use, info) => {
    await use((v) => info.annotations.push({ type: 'verdict', description: v }));
  },
});
export { expect };

export const isDesktop = (name: string) => !name.startsWith('mobile');

/** Wait for the encoder probe to settle: WebP is either enabled or disabled with the note. */
export async function webpState(page: Page): Promise<boolean> {
  const webp = page.getByLabel('WebP');
  await expect.poll(async () => (await webp.isDisabled()) || (await page.locator('#ci-webp-note').count()) === 0, { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(400);
  return !(await webp.isDisabled());
}

export async function setLimit(page: Page, value: string | null, unit: 'KB' | 'MB' = 'KB', prefix = 'ci') {
  const box = page.locator(`#${prefix}-limit-on`);
  if (value === null) {
    if ((await box.getAttribute('data-state')) === 'checked') await box.click();
    return;
  }
  if ((await box.getAttribute('data-state')) !== 'checked') await box.click();
  await page.locator(`#${prefix}-limit`).fill(value);
  await page.locator(`#${prefix}-unit`).selectOption(unit);
}

/** Compress outcome: result caption or an error alert. */
export async function compressOutcome(page: Page, timeout = 150_000) {
  await expect(page.locator('[data-testid=after-caption], main [role=alert]').first()).toBeVisible({ timeout });
}
export async function pdfOutcome(page: Page, timeout = 170_000) {
  await expect(page.locator('[data-testid=pdf-meta], main [role=alert]:not(:has-text("Skipped"))').first()).toBeVisible({ timeout });
}

export async function download(page: Page, dir: string, tag = '') {
  const link = page.getByTestId('download');
  const name0 = (await link.getAttribute('download'))!;
  // Read the exact Blob behind the link first (fallback if the browser gives no download event).
  const b64 = await link.evaluate(async (a: HTMLAnchorElement) => {
    const b = new Uint8Array(await (await fetch(a.href)).arrayBuffer());
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s);
  });
  if (page.context().browser()?.browserType().name() === 'firefox' && name0.endsWith('.webp')) {
    // Playwright-Firefox saves the WebP, opens it in a viewer tab and the app page becomes unreachable. Verify the Blob only.
    base.info().annotations.push({ type: 'download', description: `Firefox: WebP download click NOT RUN (automation opens a viewer tab); verified the link's Blob bytes for ${name0}` });
    const p = join(dir, `${tag}BLOB-${name0}`);
    writeFileSync(p, Buffer.from(b64, 'base64'));
    return { name: name0, path: p, bytes: readFileSync(p) };
  }
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }).catch(() => null), link.click()]);
  if (!d) {
    const tabs = page.context().pages().map((p) => p.url());
    base.info().annotations.push({ type: 'download', description: `no download event for ${name0} (tabs after click: ${JSON.stringify(tabs)}); bytes read from the link's blob` });
    const p = join(dir, `${tag}NO-DOWNLOAD-EVENT-${name0}`);
    writeFileSync(p, Buffer.from(b64, 'base64'));
    return { name: name0, path: p, bytes: readFileSync(p) };
  }
  const name = d.suggestedFilename();
  const p = join(dir, `${tag}${name}`);
  await d.saveAs(p);
  const bytes = readFileSync(p);
  expect(sha(bytes), 'downloaded bytes == link blob').toBe(sha(Buffer.from(b64, 'base64')));
  return { name, path: p, bytes };
}

export async function previewImgBytes(page: Page): Promise<Buffer> {
  const arr = await page.getByTestId('after-img').evaluate(async (img: HTMLImageElement) => {
    const b = new Uint8Array(await (await fetch(img.src)).arrayBuffer());
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s);
  });
  return Buffer.from(arr, 'base64');
}

export function magic(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (Buffer.from(b.subarray(0, 4)).toString('latin1') === 'RIFF' && Buffer.from(b.subarray(8, 12)).toString('latin1') === 'WEBP') return 'webp';
  if (Buffer.from(b.subarray(0, 5)).toString('latin1') === '%PDF-') return 'pdf';
  return 'unknown';
}

export type Px = [number, number, number, number];
/** Decode bytes with the browser's decoder and sample RGBA at fractional points. */
export async function decodeSample(page: Page, bytes: Uint8Array, points: Record<string, [number, number]> = {}) {
  const b64 = Buffer.from(bytes).toString('base64');
  return page.evaluate(
    async ({ b64, points }) => {
      const bin = atob(b64);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([u]));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const x = c.getContext('2d')!;
      x.drawImage(bmp, 0, 0);
      const samples: Record<string, number[]> = {};
      for (const [k, [fx, fy]] of Object.entries(points))
        samples[k] = [...x.getImageData(Math.min(c.width - 1, Math.floor(c.width * fx)), Math.min(c.height - 1, Math.floor(c.height * fy)), 1, 1).data];
      return { width: bmp.width, height: bmp.height, samples: samples as Record<string, [number, number, number, number]> };
    },
    { b64, points },
  );
}
export const red = ([r, g, b]: number[]) => r! > 170 && g! < 100 && b! < 100;
export const blue = ([r, g, b]: number[]) => b! > 170 && r! < 100 && g! < 100;
export const white = ([r, g, b]: number[]) => r! > 215 && g! > 215 && b! > 215;
export const near = (a: number[], hex: string, tol = 40) => {
  const n = parseInt(hex.slice(1), 16);
  const t = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return t.every((v, i) => Math.abs(v - a[i]!) <= tol);
};

/** Drop files on a drop zone by dispatching real drag events with a DataTransfer. */
export async function dropFiles(zone: Locator, files: { path: string; mime: string }[]) {
  const payload = files.map((f) => ({ name: basename(f.path), mime: f.mime, b64: readFileSync(f.path).toString('base64') }));
  await zone.evaluate((el, files) => {
    const dt = new DataTransfer();
    for (const f of files) {
      const bin = atob(f.b64);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      dt.items.add(new File([u], f.name, { type: f.mime }));
    }
    for (const t of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, payload);
}

export interface PdfPageInfo {
  width: number;
  height: number;
  images: { width: number; height: number; filter: string; bytes: Uint8Array }[];
  /** Placement from the content stream `w 0 0 h x y cm`. */
  placement: { w: number; h: number; x: number; y: number } | null;
}
/** Read the downloaded PDF itself: page sizes, embedded image streams, placement matrices. */
export async function inspectPdf(bytes: Uint8Array): Promise<{ pageCount: number; pages: PdfPageInfo[]; producer?: string; title?: string }> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages: PdfPageInfo[] = [];
  for (const p of doc.getPages()) {
    const { width, height } = p.getSize();
    const images: PdfPageInfo['images'] = [];
    const xo = p.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    for (const [, ref] of xo?.entries() ?? []) {
      const s = doc.context.lookup(ref as PDFRef);
      if (s instanceof PDFRawStream) {
        images.push({
          width: Number(s.dict.get(PDFName.of('Width'))?.toString()),
          height: Number(s.dict.get(PDFName.of('Height'))?.toString()),
          filter: String(s.dict.get(PDFName.of('Filter'))),
          bytes: s.contents,
        });
      }
    }
    let text = '';
    const contents = p.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
    for (const st of streams) if (st instanceof PDFRawStream) text += Buffer.from(decodePDFRawStream(st).decode()).toString('latin1');
    // pdf-lib writes `1 0 0 1 tx ty cm` (translate) then `w 0 0 h 0 0 cm` (scale) before `/Img Do`.
    const before = text.split(/\/[\w-]+ Do/)[0] ?? '';
    let x = 0, y = 0, w = 0, h = 0;
    for (const m of before.matchAll(/(-?[\d.]+) 0 0 (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm/g)) {
      const [a, d, e, f] = [+m[1]!, +m[2]!, +m[3]!, +m[4]!];
      if (a === 1 && d === 1) { x += e; y += f; } else { w = a; h = d; x += e; y += f; }
    }
    pages.push({ width, height, images, placement: w && h ? { w, h, x, y } : null });
  }
  return { pageCount: doc.getPageCount(), pages, producer: doc.getProducer(), title: doc.getTitle() };
}

/** Capture SHA-256 of every %PDF buffer the page hands to a Worker (PDF.js preview receives the exported bytes this way). */
export async function hookPdfPreviewHashes(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __pdfHashes: string[] };
    w.__pdfHashes = [];
    const orig = Worker.prototype.postMessage;
    const isPdf = (u: Uint8Array) => u.length > 5 && u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46 && u[4] === 0x2d;
    const scan = (v: unknown, depth: number) => {
      if (!v || depth > 5) return;
      let u: Uint8Array | null = null;
      if (v instanceof ArrayBuffer) u = new Uint8Array(v);
      else if (ArrayBuffer.isView(v)) u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      if (u) {
        if (isPdf(u)) {
          const copy = u.slice();
          void crypto.subtle.digest('SHA-256', copy).then((d) => w.__pdfHashes.push([...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')));
        }
        return;
      }
      if (typeof v === 'object') for (const k of Object.keys(v as object)) scan((v as Record<string, unknown>)[k], depth + 1);
    };
    Worker.prototype.postMessage = function (this: Worker, msg: unknown, t?: unknown) {
      try {
        scan(msg, 0);
      } catch {
        /* ignore */
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (orig as any).call(this, msg, t);
    };
  });
}

export function writeJson(dir: string, name: string, data: unknown) {
  writeFileSync(join(dir, name), JSON.stringify(data, (_, v) => (v instanceof Uint8Array || Buffer.isBuffer(v) ? `<${v.length} bytes>` : v), 1));
}

/**
 * Make reads of chosen files slow, by file name, so a test controls which pick finishes first.
 * Wraps Blob.slice/arrayBuffer in the page (slices inherit the file name).
 */
export async function slowReads(page: Page, delays: Record<string, number>) {
  await page.addInitScript((delays) => {
    type Tagged = Blob & { __qaName?: string };
    const name = (b: Tagged) => b.__qaName ?? (b instanceof File ? b.name : undefined);
    const slice = Blob.prototype.slice;
    Blob.prototype.slice = function (this: Tagged, ...a: Parameters<Blob['slice']>) {
      const r = slice.apply(this, a) as Tagged;
      r.__qaName = name(this);
      return r;
    };
    const ab = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = async function (this: Tagged) {
      const d = delays[name(this) ?? ''];
      if (d) await new Promise((r) => setTimeout(r, d));
      return ab.call(this);
    };
  }, delays);
}

/** Fire one `change` event per file on the page's first file input, all in the same task. */
export async function pickInPage(page: Page, files: { name: string; b64: string; type: string }[], perEvent = 1) {
  await page.evaluate(
    ({ files, perEvent }) => {
      const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
      const mk = (f: { name: string; b64: string; type: string }) => {
        const bin = atob(f.b64);
        const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return new File([u], f.name, { type: f.type });
      };
      for (let i = 0; i < files.length; i += perEvent) {
        const dt = new DataTransfer();
        for (const f of files.slice(i, i + perEvent)) dt.items.add(mk(f));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    { files, perEvent },
  );
}
