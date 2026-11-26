/**
 * Helpers for the contract E2E suites (tool-common.spec.ts and the per-tool specs).
 * Every helper observes the real UI and the real downloaded bytes; nothing is mocked except where a test says so.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

export const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
export type Payload = { name: string; mimeType: string; buffer: Buffer };

/**
 * Installs (before any page script) a read hold and a beacon recorder:
 * - `__lovertHold(size)`: the next Blob.arrayBuffer() of a blob of exactly `size` bytes waits until `__lovertRelease()`.
 *   Lets a test switch files while the first one is still being read, without timing guesses.
 * - `__lovertBeacons`: every navigator.sendBeacon call (analytics must not send file data).
 */
export async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const orig = Blob.prototype.arrayBuffer;
    let hold: { size: number; p: Promise<void>; r: () => void; hits: number } | null = null;
    w.__lovertHold = (size: number) => {
      let r!: () => void;
      const p = new Promise<void>((x) => (r = x));
      hold = { size, p, r, hits: 0 };
    };
    w.__lovertRelease = () => hold?.r();
    w.__lovertHeld = () => hold?.hits ?? 0;
    Blob.prototype.arrayBuffer = async function (this: Blob) {
      const h = hold;
      if (h && this.size === h.size) {
        h.hits++;
        await h.p;
      }
      return orig.call(this);
    };
    const beacons: string[] = [];
    w.__lovertBeacons = beacons;
    if (navigator.sendBeacon) {
      const sb = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => (beacons.push(String(url)), sb(url, data));
    }
  });
}

/**
 * Network watch for the whole test: anything that is not a local GET/HEAD without a body is an offender,
 * and so is any request whose URL contains one of the `secrets` (file names, content markers).
 */
export function privacyWatch(page: Page, secrets: string[] = []) {
  const offenders: string[] = [];
  const all: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    all.push(`${r.method()} ${r.url()}`);
    const local = url.hostname === 'localhost' || url.protocol === 'blob:' || url.protocol === 'data:';
    if (!['GET', 'HEAD'].includes(r.method()) || r.postData() || !local) offenders.push(`${r.method()} ${r.url()}`);
    const decoded = decodeURIComponent(r.url()).normalize('NFC');
    for (const s of secrets) if (s && decoded.includes(s.normalize('NFC'))) offenders.push(`secret "${s}" in ${r.url()}`);
  });
  return {
    offenders,
    all,
    async assertClean() {
      const beacons = await page.evaluate(() => (window as unknown as { __lovertBeacons?: string[] }).__lovertBeacons ?? []).catch(() => []);
      expect(beacons, 'no analytics beacons in the default build').toEqual([]);
      expect(offenders, 'no request may carry file data, names or content').toEqual([]);
    },
  };
}

/** Click a download link through the UI and read the bytes the browser saved. */
export async function downloadVia(page: Page, link: Locator) {
  const [d] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const path = await d.path();
  if (!path) throw new Error('download was not saved');
  return { name: d.suggestedFilename().normalize('NFC'), bytes: readFileSync(path) };
}

/** Bytes behind a blob: URL in the page (the preview source or the download href). */
export async function blobBytes(page: Page, url: string): Promise<{ bytes: Buffer; type: string }> {
  const r = await page.evaluate(async (u) => {
    const b = await (await fetch(u)).blob();
    return { data: [...new Uint8Array(await b.arrayBuffer())], type: b.type };
  }, url);
  return { bytes: Buffer.from(r.data), type: r.type };
}

/** Decode an image in the page and read pixels at fractional positions. */
export async function decodePixels(page: Page, bytes: Buffer, mime: string, points: [number, number][]) {
  return page.evaluate(
    async ({ data, mime, points }) => {
      const bmp = await createImageBitmap(new Blob([new Uint8Array(data)], { type: mime }));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const x = c.getContext('2d', { willReadFrequently: true })!;
      x.drawImage(bmp, 0, 0);
      const px = points.map(([fx, fy]) => [...x.getImageData(Math.min(bmp.width - 1, Math.floor(bmp.width * fx)), Math.min(bmp.height - 1, Math.floor(bmp.height * fy)), 1, 1).data]);
      return { width: bmp.width, height: bmp.height, px };
    },
    { data: [...bytes], mime, points },
  );
}

/** Colour checks with tolerances wide enough for lossy codecs (q 85 JPEG/WebP) on large flat areas. */
export const near = (px: number[], rgb: [number, number, number], tol = 48) => rgb.every((v, i) => Math.abs(px[i]! - v) <= tol);

/** What the page does the instant a job is handed to the worker. Plain data: the export's CSP forbids eval. */
export type JobSentAction =
  | { type: 'files'; selector: string; files: { name: string; type: string; b64: string }[] }
  | { type: 'click'; selector: string }
  | { type: 'select'; selector: string; value: string };

/** Run `action` in the page synchronously from the performance mark `lovert:job-sent` (set by runner.ts on send). */
export async function onJobSent(page: Page, action: JobSentAction) {
  await page.evaluate((a) => {
    new PerformanceObserver((list, obs) => {
      if (!list.getEntriesByName('lovert:job-sent').length) return;
      obs.disconnect();
      const el = document.querySelector(a.selector) as HTMLElement | null;
      if (!el) throw new Error(`onJobSent: ${a.selector} not found`);
      if (a.type === 'click') el.click();
      else if (a.type === 'select') {
        const sel = el as HTMLSelectElement;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, a.value);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const dt = new DataTransfer();
        for (const f of a.files) {
          const bin = atob(f.b64);
          const u = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          dt.items.add(new File([u], f.name, { type: f.type }));
        }
        (el as HTMLInputElement).files = dt.files;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }).observe({ type: 'mark' });
  }, action);
}

export const swapFiles = (selector: string, files: Payload[]): JobSentAction => ({
  type: 'files',
  selector,
  files: files.map((f) => ({ name: f.name, type: f.mimeType, b64: f.buffer.toString('base64') })),
});

export const marks = (page: Page, name: string) => page.evaluate((m) => performance.getEntriesByName(m).length, name);

/** Show a workspace pane on narrow screens (no-op on desktop, where both panes show). */
export async function pane(page: Page, name: RegExp | string) {
  const btn = page.getByRole('group', { name: 'Workspace view' }).getByRole('button', { name });
  if (await btn.isVisible()) await btn.click();
}

export const alerts = (page: Page) => page.locator('main [role=alert]');

/**
 * WebP encoding is a runtime capability, read from the page's own encoder probe (never from the browser name).
 * When it is missing, verifies the UI handles it (clear alert, disabled action, no .webp download) and records a
 * verified UNSUPPORTED annotation for the tool gate; returns false so the caller stops.
 */
export async function webpEncodeAvailable(page: Page, info: TestInfo, actionName: string | RegExp): Promise<boolean> {
  const root = page.locator('[data-webp-encoder]');
  await expect(root).not.toHaveAttribute('data-webp-encoder', 'pending', { timeout: 20_000 });
  if ((await root.getAttribute('data-webp-encoder')) === 'yes') return true;
  await pane(page, /Settings|Result/);
  await expect(alerts(page).filter({ hasText: 'WebP is unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: actionName })).toBeDisabled();
  await expect(page.getByTestId('download')).toHaveCount(0);
  info.annotations.push({ type: 'unsupported', description: 'webp-encode: encoder probe returned non-WebP bytes; UI shows "WebP is unavailable", disables the action and offers no download' });
  return false;
}

/**
 * Diagnostics for flaky/stuck cases: console, page errors, failed requests, pipeline marks (lovert:*) with times,
 * and the DOM state of the tool. Call `start` before navigation; `attach` always adds a timeline (pass or fail),
 * and on failure also a DOM snapshot, so a stuck step can be named from the report.
 */
export function diagnostics(page: Page) {
  const t0 = Date.now();
  const events: { t: number; kind: string; text: string }[] = [];
  const at = () => Date.now() - t0;
  page.on('console', (m) => events.push({ t: at(), kind: `console.${m.type()}`, text: m.text().slice(0, 300) }));
  page.on('pageerror', (e) => events.push({ t: at(), kind: 'pageerror', text: `${e.name}: ${e.message}`.slice(0, 500) }));
  page.on('requestfailed', (r) => events.push({ t: at(), kind: 'requestfailed', text: `${r.url()} ${r.failure()?.errorText ?? ''}` }));
  page.on('response', (r) => r.status() >= 400 && events.push({ t: at(), kind: `http.${r.status()}`, text: r.url() }));
  page.on('worker', (w) => events.push({ t: at(), kind: 'worker', text: w.url() }));
  page.on('crash', () => events.push({ t: at(), kind: 'crash', text: 'page crashed' }));
  page.on('framenavigated', (f) => f === page.mainFrame() && events.push({ t: at(), kind: 'navigated', text: f.url() }));
  return {
    note: (text: string) => events.push({ t: at(), kind: 'step', text }),
    async attach(info: TestInfo) {
      const state = await page
        .evaluate(() => {
          const marks = performance.getEntriesByType('mark').filter((m) => m.name.startsWith('lovert:')).map((m) => ({ name: m.name, at: Math.round(m.startTime) }));
          const status = document.querySelector('[role=status]');
          const input = document.querySelector<HTMLInputElement>('input[type=file]');
          return {
            url: location.href,
            readyState: document.readyState,
            sinceNavigationMs: Math.round(performance.now()),
            marks,
            statusExists: !!status,
            statusText: status?.textContent ?? null,
            statusVisible: status ? !!(status as HTMLElement).offsetParent : null,
            alerts: [...document.querySelectorAll('main [role=alert]')].map((a) => a.textContent),
            filesInInput: input?.files?.length ?? null,
            downloadLinks: document.querySelectorAll('[data-testid=download]').length,
            hydrated: !!document.querySelector('[data-pane]'),
            bodyChars: document.body?.innerText.length ?? 0,
          };
        })
        .catch((e) => ({ evaluateFailed: String(e) }));
      const failed = info.status !== info.expectedStatus;
      await info.attach('timeline.json', { body: JSON.stringify({ project: info.project.name, retry: info.retry, repeat: info.repeatEachIndex, failed, durationMs: at(), state, events }, null, 2), contentType: 'application/json' });
      if (failed) await info.attach('dom.html', { body: (await page.content().catch(() => '<unavailable>')).slice(0, 200_000), contentType: 'text/html' });
    },
  };
}
