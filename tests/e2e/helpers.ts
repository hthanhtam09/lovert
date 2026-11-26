import type { Page } from '@playwright/test';

/** Records anything that could carry file data off the device: non-GET/HEAD, any body, or another origin. */
export function watchNetwork(page: Page) {
  const offenders: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    const local = url.hostname === 'localhost' || url.protocol === 'blob:' || url.protocol === 'data:';
    if (!['GET', 'HEAD'].includes(r.method()) || r.postData() || !local) offenders.push(`${r.method()} ${r.url()}`);
  });
  return offenders;
}

export const png = (name: string, buffer: Buffer) => ({ name, mimeType: 'image/png', buffer });

/**
 * Asymmetric test JPEG drawn by the browser's own canvas: stored 240×120 (landscape), white,
 * red block at stored top-left (0..80, 0..40), small blue block at stored bottom-right.
 * With EXIF Orientation 6 it must display as 120×240 with red at the TOP-RIGHT.
 */
export async function asymmetricJpeg(page: Page): Promise<Buffer> {
  const data = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 120;
    const x = c.getContext('2d')!;
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 240, 120);
    x.fillStyle = '#f00';
    x.fillRect(0, 0, 80, 40);
    x.fillStyle = '#00f';
    x.fillRect(200, 100, 40, 20);
    const b = await new Promise<Blob>((r) => c.toBlob((bl) => r(bl!), 'image/jpeg', 0.95));
    return [...new Uint8Array(await b.arrayBuffer())];
  });
  return Buffer.from(data);
}

export type Rgb = [number, number, number];
export const isRed = ([r, g, b]: Rgb) => r > 180 && g < 90 && b < 90;
export const isWhite = ([r, g, b]: Rgb) => r > 220 && g > 220 && b > 220;
export const isBlue = ([r, g, b]: Rgb) => b > 180 && r < 90 && g < 90;

/**
 * Photo-like JPEG drawn in the page with a seeded PRNG (gradient, shapes, grain), JPEG q0.9.
 * Optional `caption` draws a line of small text so readers can check legibility after compression.
 */
export async function photoJpeg(page: Page, w: number, h: number, seed: number, caption?: string): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ w, h, seed, caption }) => {
      let s = seed;
      const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      const c = new OffscreenCanvas(w, h);
      const x = c.getContext('2d')!;
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#2b5876');
      g.addColorStop(1, '#e8a87c');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) {
        x.fillStyle = `hsla(${rnd() * 360},60%,${30 + rnd() * 50}%,0.5)`;
        x.beginPath();
        x.arc(rnd() * w, rnd() * h, (rnd() * Math.min(w, h)) / 12, 0, 7);
        x.fill();
      }
      // Fine noise so the image does not compress trivially (like sensor grain).
      const tile = x.getImageData(0, 0, 256, 256);
      for (let i = 0; i < tile.data.length; i += 4) {
        const n = (rnd() - 0.5) * 40;
        tile.data[i] += n; tile.data[i + 1] += n; tile.data[i + 2] += n;
      }
      const t = new OffscreenCanvas(256, 256);
      t.getContext('2d')!.putImageData(tile, 0, 0);
      x.globalAlpha = 0.35;
      x.fillStyle = x.createPattern(t, 'repeat')!;
      x.fillRect(0, 0, w, h);
      if (caption) {
        x.globalAlpha = 1;
        x.fillStyle = 'rgba(255,255,255,0.85)';
        const fs = Math.round(h / 60);
        x.fillRect(0, h - fs * 3, w, fs * 3);
        x.fillStyle = '#222';
        x.font = `${fs}px sans-serif`;
        x.fillText(caption, fs, h - fs);
      }
      const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    { w, h, seed, caption },
  );
  return Buffer.from(b64, 'base64');
}


/** On narrow screens the tool shows one pane at a time; switch to it. No-op on wide screens (the switch is hidden). */
export async function showPane(page: Page, name: RegExp | string) {
  const btn = page.getByRole('group', { name: 'Workspace view' }).getByRole('button', { name });
  if (await btn.isVisible()) await btn.click();
}
