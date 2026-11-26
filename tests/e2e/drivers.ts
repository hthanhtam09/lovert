/**
 * One driver per public tool: how to feed it, run it, read its result and tell two inputs apart.
 * tool-common.spec.ts runs the shared matrix through these drivers; every route keeps its own fixtures and assertions.
 */
import { expect, type Page, type TestInfo } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { asymJpeg, alphaWebp, blueWebp, splitJpeg } from '../fixtures/encoded';
import { noisyPng, solidPng } from '../fixtures/png';
import { alerts, decodePixels, pane, sha, webpEncodeAvailable, type JobSentAction, type Payload } from './gate-helpers';
export { sha };

type Img = 'jpeg' | 'png' | 'webp';
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;
const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp' } as const;
const NAME = { jpeg: 'JPG', png: 'PNG', webp: 'WebP' } as const;

export interface Output {
  name: string;
  bytes: Buffer;
}

export interface Driver {
  slug: string;
  path: string;
  /** Accessible name of the file input. */
  input: RegExp;
  /** Valid inputs A and B with different sizes and content, so the result reveals which one produced it. */
  a: Payload;
  b: Payload;
  /** Valid content under a wrong extension/MIME (accepted by the content-first policy) and the expected download name. */
  misnamed: { file: Payload; outName: string };
  /** Content that is not what the route takes (message text expected). */
  mismatch: { file: Payload; message: RegExp };
  corrupt: { file: Payload; message: RegExp };
  empty: { file: Payload; message: RegExp };
  /** Expected download name for A. */
  outName: string;
  outMime: string;
  /** Prepare settings after picking (e.g. choose an output format). */
  prepare?(page: Page): Promise<void>;
  /** Start the job (no-op for tools that convert on pick). */
  run(page: Page): Promise<void>;
  /** Name of the main action button, or null when the tool converts on pick. */
  action: string | null;
  done(page: Page): Promise<void>;
  /** Bytes read when a file is picked (the header probe reads at most 256 KB; data tools read the whole file). */
  readSize(p: Payload): number;
  /** Identity of the result after B was added while A was pending ('B' when B replaces A, 'A+B' when B is added). */
  afterSwap: string;
  /** Which input produced this output. */
  identify(page: Page, out: Output): Promise<'A' | 'B' | string>;
  /** Assert the on-screen preview was made from exactly these downloaded bytes. */
  assertPreview(page: Page, out: Output): Promise<void>;
  /** Change a setting that affects the output; null when the tool has none. */
  changeSetting: ((page: Page) => Promise<void>) | null;
  /** The same setting change, done by the page itself while a job runs. */
  changeSettingAction: JobSentAction | null;
  /** Selector of the hidden native file input (for in-page swaps). */
  inputSelector: string;
  /** Runtime capability check; false = verified UNSUPPORTED already recorded. */
  capable(page: Page, info: TestInfo): Promise<boolean>;
  usesWorker: boolean;
  secrets: string[];
}

const truncated = (b: Buffer) => b.subarray(0, Math.floor(b.length * 0.6));
const imgPreview = async (page: Page, out: Output) => {
  await pane(page, 'Preview');
  const src = await page.getByTestId('after-img').getAttribute('src');
  const data = await page.evaluate(async (u) => [...new Uint8Array(await (await fetch(u!)).arrayBuffer())], src);
  expect(sha(Uint8Array.from(data)), 'preview image bytes == downloaded bytes').toBe(sha(out.bytes));
};
const dims = async (page: Page, out: Output, mime: string) => {
  const d = await decodePixels(page, out.bytes, mime, []);
  return `${d.width}x${d.height}`;
};

function imageSource(f: Img, which: 'A' | 'B', base: string): Payload {
  if (f === 'png') return { name: `${base}.png`, mimeType: MIME.png, buffer: which === 'A' ? noisyPng(240, 120, 1) : noisyPng(160, 80, 2) };
  if (f === 'jpeg') return { name: `${base}.jpg`, mimeType: MIME.jpeg, buffer: which === 'A' ? asymJpeg : splitJpeg };
  return { name: `${base}.webp`, mimeType: MIME.webp, buffer: which === 'A' ? alphaWebp : blueWebp };
}
const SIZE: Record<Img, { A: string; B: string }> = { png: { A: '240x120', B: '160x80' }, jpeg: { A: '240x120', B: '160x80' }, webp: { A: '200x100', B: '120x60' } };

export function converterDriver(slug: string, from: Img, to: Img): Driver {
  const base = `secret-${slug}-ảnh`;
  const a = imageSource(from, 'A', base);
  const b = imageSource(from, 'B', `${base}-b`);
  const other: Img = from === 'jpeg' ? 'png' : 'jpeg';
  const wrong = imageSource(other, 'A', 'wrong');
  const action = `Convert to ${NAME[to]}`;
  return {
    slug,
    path: `/${slug}`,
    input: new RegExp(`Choose a ${NAME[from]} image`),
    a,
    b,
    misnamed: { file: { ...a, name: `misnamed.${EXT[to]}`, mimeType: 'application/octet-stream' }, outName: `misnamed.${EXT[to]}` },
    mismatch: { file: { ...wrong, name: `wrong.${EXT[from]}`, mimeType: MIME[from] }, message: new RegExp(`That file is a ${NAME[other]} image, not ${NAME[from]}`) },
    corrupt: { file: { ...a, name: `cut.${EXT[from]}`, buffer: truncated(a.buffer) }, message: /incomplete|damaged/ },
    empty: { file: { ...a, name: `empty.${EXT[from]}`, buffer: Buffer.alloc(0) }, message: /empty/ },
    outName: `${base}.${EXT[to]}`,
    outMime: MIME[to],
    async run(page) {
      await pane(page, /Settings|Result/);
      await page.getByRole('button', { name: action }).click();
    },
    action,
    async done(page) {
      await expect(page.getByRole('status')).toContainText('passed all checks', { timeout: 60_000 });
    },
    async identify(page, out) {
      const d = await dims(page, out, MIME[to]);
      return d === SIZE[from].A ? 'A' : d === SIZE[from].B ? 'B' : d;
    },
    assertPreview: imgPreview,
    changeSetting: async (page) => {
      await pane(page, /Settings|Result/);
      await page.locator('#ci-limit-on').click();
    },
    changeSettingAction: { type: 'click', selector: '#ci-limit-on' },
    inputSelector: 'input[type=file]',
    capable: (page, info) => (to === 'webp' ? webpEncodeAvailable(page, info, action) : Promise.resolve(true)),
    usesWorker: true,
    readSize: (p) => Math.min(p.buffer.length, 256 * 1024),
    afterSwap: 'B',
    secrets: [base, 'secret-'],
  };
}

export const compressDriver: Driver = (() => {
  const base = 'secret-compress-ảnh';
  const a = { name: `${base}.png`, mimeType: 'image/png', buffer: noisyPng(240, 120, 1) };
  const b = { name: `${base}-b.png`, mimeType: 'image/png', buffer: noisyPng(160, 80, 2) };
  return {
    slug: 'compress-image',
    path: '/compress-image',
    input: /Choose an image/,
    a,
    b,
    misnamed: { file: { ...a, name: 'misnamed.jpg', mimeType: 'image/jpeg' }, outName: 'misnamed.jpg' },
    mismatch: { file: { name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('this is text, not an image') }, message: /not a JPG, PNG or WebP image/ },
    corrupt: { file: { ...a, name: 'cut.png', buffer: truncated(a.buffer) }, message: /incomplete|damaged/ },
    empty: { file: { ...a, name: 'empty.png', buffer: Buffer.alloc(0) }, message: /empty/ },
    outName: `${base}.jpg`,
    outMime: 'image/jpeg',
    async prepare(page) {
      await pane(page, /Settings|Result/);
      await page.getByLabel('JPEG', { exact: true }).check();
    },
    async run(page) {
      await pane(page, /Settings|Result/);
      await page.getByRole('button', { name: 'Compress', exact: true }).click();
    },
    action: 'Compress',
    async done(page) {
      await expect(page.getByRole('status')).toContainText('passed all checks', { timeout: 60_000 });
    },
    async identify(page, out) {
      const d = await dims(page, out, 'image/jpeg');
      return d === '240x120' ? 'A' : d === '160x80' ? 'B' : d;
    },
    assertPreview: imgPreview,
    changeSetting: async (page) => {
      await pane(page, /Settings|Result/);
      await page.getByLabel('Maximum size').fill('90');
    },
    changeSettingAction: { type: 'click', selector: '#ci-limit-on' },
    inputSelector: 'input[type=file]',
    capable: async () => true,
    usesWorker: true,
    readSize: (p) => Math.min(p.buffer.length, 256 * 1024),
    afterSwap: 'B',
    secrets: [base],
  };
})();

export const pdfDriver: Driver = (() => {
  const base = 'secret-pdf-ảnh';
  const a = { name: `${base}-red.png`, mimeType: 'image/png', buffer: solidPng(400, 200, [255, 0, 0]) };
  const b = { name: `${base}-green.png`, mimeType: 'image/png', buffer: solidPng(200, 300, [0, 200, 0]) };
  return {
    slug: 'images-to-pdf',
    path: '/images-to-pdf',
    input: /Add images/,
    a,
    b,
    misnamed: { file: { ...a, name: 'misnamed.jpg', mimeType: 'image/jpeg' }, outName: 'images.pdf' },
    mismatch: { file: { name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('plain text') }, message: /notes\.jpg \(not JPG, PNG or WebP\)/ },
    corrupt: { file: { ...a, name: 'cut.png', buffer: truncated(a.buffer) }, message: /cut\.png \(damaged or incomplete PNG\)/ },
    empty: { file: { ...a, name: 'empty.png', buffer: Buffer.alloc(0) }, message: /empty\.png \(empty\)/ },
    outName: 'images.pdf',
    outMime: 'application/pdf',
    async run(page) {
      await pane(page, /Settings|Result/);
      await page.getByRole('button', { name: 'Create PDF' }).click();
    },
    action: 'Create PDF',
    async done(page) {
      await expect(page.getByTestId('pdf-meta')).toContainText('page', { timeout: 60_000 });
    },
    /** A = red landscape image (landscape page), B = green portrait image (portrait page); 'A+B' = both, in that order. */
    async identify(_page, out) {
      const doc = await PDFDocument.load(out.bytes, { updateMetadata: false });
      const kind = doc.getPages().map((p) => (p.getWidth() > p.getHeight() ? 'A' : 'B'));
      return kind.join('+');
    },
    async assertPreview(page, out) {
      await pane(page, /Pages|Preview/);
      const host = page.getByTestId('pdf-pages');
      await expect(host).toHaveAttribute('data-sha256', /[0-9a-f]{64}/, { timeout: 30_000 });
      expect(await host.getAttribute('data-sha256'), 'bytes rendered by the PDF preview == downloaded PDF').toBe(sha(out.bytes));
      const doc = await PDFDocument.load(out.bytes, { updateMetadata: false });
      await expect(page.getByText(new RegExp(`Preview of the exported PDF: ${doc.getPageCount()} page`))).toBeVisible({ timeout: 30_000 });
    },
    changeSetting: async (page) => {
      await pane(page, /Settings|Result/);
      await page.getByLabel('Paper').selectOption('letter');
    },
    changeSettingAction: { type: 'select', selector: '#pdf-paper', value: 'a4' },
    inputSelector: 'input[type=file]',
    capable: async () => true,
    usesWorker: true,
    readSize: (p) => Math.min(p.buffer.length, 256 * 1024),
    afterSwap: 'A+B', // a file added during a job is appended, never replaces the list
    secrets: [base],
  };
})();

function dataDriver(direction: 'csv-to-json' | 'json-to-csv'): Driver {
  const csv = direction === 'csv-to-json';
  const base = `secret-${direction}-dữ liệu`;
  const marker = 'Bí mật Nguyễn Ánh';
  const a = csv
    ? { name: `${base}.csv`, mimeType: 'text/csv', buffer: Buffer.from(`id,name\n001,${marker}\n` + '002,x\n'.repeat(20_000)) }
    : { name: `${base}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ id: '001', name: marker }, ...Array(20_000).fill({ id: '002', name: 'x' })])) };
  const b = csv
    ? { name: `${base}-b.csv`, mimeType: 'text/csv', buffer: Buffer.from('code,city\n7,Huế\n') }
    : { name: `${base}-b.json`, mimeType: 'application/json', buffer: Buffer.from('[{"code":"7","city":"Huế"}]') };
  const to = csv ? 'json' : 'csv';
  return {
    slug: direction,
    path: `/${direction}`,
    input: new RegExp(`Choose a ${csv ? 'CSV' : 'JSON'} file`),
    a,
    b,
    misnamed: { file: { ...b, name: 'misnamed.txt', mimeType: 'text/plain' }, outName: `misnamed.${to}` },
    mismatch: csv
      ? { file: { name: 'image.csv', mimeType: 'text/csv', buffer: noisyPng(8, 8, 1) }, message: /not UTF-8 text/ }
      : { file: { name: 'table.json', mimeType: 'application/json', buffer: Buffer.from('a,b\n1,2\n') }, message: /not valid JSON/ },
    corrupt: csv
      ? { file: { name: 'cut.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,"never closed\n') }, message: /never closed/ }
      : { file: { name: 'cut.json', mimeType: 'application/json', buffer: Buffer.from('[{"a":"1"},{"a":') }, message: /not valid JSON/ },
    empty: { file: { name: `empty.${csv ? 'csv' : 'json'}`, mimeType: 'text/plain', buffer: Buffer.alloc(0) }, message: /empty/ },
    outName: `${base}.${to}`,
    outMime: csv ? 'application/json' : 'text/csv',
    async run() {},
    action: null,
    async done(page) {
      await pane(page, /Settings|Result/);
      await expect(page.getByRole('status')).toContainText('converted and checked', { timeout: 60_000 });
    },
    async identify(_page, out) {
      const text = out.bytes.toString('utf8').replace(/^\uFEFF/, '');
      if (csv) {
        const first = JSON.parse(text)[0];
        return first.id === '001' ? 'A' : first.code === '7' ? 'B' : JSON.stringify(first);
      }
      return text.startsWith('id,name') ? 'A' : text.startsWith('code,city') ? 'B' : text.slice(0, 20);
    },
    async assertPreview(page, out) {
      await pane(page, 'Preview');
      const text = (await page.getByTestId('preview-text').textContent()) ?? '';
      const full = out.bytes.toString('utf8').replace(/^\uFEFF/, '');
      // Small outputs are shown whole; large ones show the start, and the page says the download is complete.
      if (text.length < full.length) {
        expect(full.startsWith(text), 'preview text is the start of the downloaded file').toBe(true);
        await expect(page.getByText(`The downloaded file is complete (${out.bytes.length.toLocaleString('en-US')} bytes)`)).toBeVisible();
      } else expect(text, 'preview text == downloaded text').toBe(full);
    },
    changeSetting: csv
      ? null
      : async (page) => {
          await pane(page, /Settings|Result/);
          await page.getByLabel(/Add a UTF-8 BOM/).click();
        },
    changeSettingAction: csv ? null : { type: 'click', selector: '#dt-bom' },
    inputSelector: 'input[type=file]',
    capable: async () => true,
    usesWorker: true,
    readSize: (p) => p.buffer.length,
    afterSwap: 'B',
    secrets: [base, marker],
  };
}

export const DRIVERS: Driver[] = [
  compressDriver,
  pdfDriver,
  converterDriver('png-to-jpg', 'png', 'jpeg'),
  converterDriver('jpg-to-png', 'jpeg', 'png'),
  converterDriver('png-to-webp', 'png', 'webp'),
  converterDriver('jpg-to-webp', 'jpeg', 'webp'),
  converterDriver('webp-to-png', 'webp', 'png'),
  converterDriver('webp-to-jpg', 'webp', 'jpeg'),
  dataDriver('csv-to-json'),
  dataDriver('json-to-csv'),
];

export { alerts };
