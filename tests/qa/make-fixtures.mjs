/* global console, Buffer, OffscreenCanvas, btoa */
// QA fixture generator for /compress-image and /images-to-pdf.
// Reproducible: seeded drawing in headless Chromium + byte-level crafted edge files. All content is synthetic
// (fake document text, fake signature). Output: qa-results/two-tools/fixtures (git-ignored) + manifest.json.
// Run: node tests/qa/make-fixtures.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const OUT = 'qa-results/two-tools/fixtures';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'pages'), { recursive: true });
mkdirSync(join(OUT, 'dup-a'), { recursive: true });
mkdirSync(join(OUT, 'dup-b'), { recursive: true });
mkdirSync(join(OUT, 'many'), { recursive: true });
const manifest = [];

function magic(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b.subarray(0, 6).toString('latin1') === 'GIF89a') return 'gif';
  if (b.subarray(0, 2).toString('latin1') === 'BM') return 'bmp';
  return b.length === 0 ? 'empty' : 'unknown';
}
function save(rel, buf, meta) {
  writeFileSync(join(OUT, rel), buf);
  manifest.push({ file: rel, realFormat: magic(buf), bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex').slice(0, 16), ...meta });
}

// ---- PNG writer (same algorithm as tests/fixtures/png.ts) ----
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
function makePng(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h); let o = 0;
  for (let y = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w; x++) { const p = px(x, y); raw[o++] = p[0]; raw[o++] = p[1]; raw[o++] = p[2]; raw[o++] = p[3]; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const pngHeaderOnly = (w, h) => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), Buffer.alloc(2000, 0x55)]); };
const jpegHeaderOnly = (w, h) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 0xff, w >> 8, w & 0xff, 3]), Buffer.alloc(9), Buffer.alloc(2000, 0x55)]);
function withExif(jpeg, orientation) {
  const tiff = Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const len = payload.length + 2;
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1, len >> 8, len & 0xff]), payload, jpeg.subarray(2)]);
}
/** Valid image + zero padding after the end so the file has exactly `size` bytes (browsers ignore trailing data). */
const padTo = (buf, size) => Buffer.concat([buf, Buffer.alloc(size - buf.length)]);

// ---- Canvas-drawn fixtures ----
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
async function draw(kind, w, h, type, quality, opts = {}) {
  const b64 = await page.evaluate(async ({ kind, w, h, type, quality, opts }) => {
    let s = opts.seed ?? 1;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const c = new OffscreenCanvas(w, h);
    const x = c.getContext('2d');
    if (kind === 'photo') {
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2b5876'); g.addColorStop(1, '#e8a87c');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) { x.fillStyle = `hsla(${rnd() * 360},60%,${30 + rnd() * 50}%,0.5)`; x.beginPath(); x.arc(rnd() * w, rnd() * h, (rnd() * Math.min(w, h)) / 12, 0, 7); x.fill(); }
      const tw = Math.min(256, w), th = Math.min(256, h);
      const tile = x.getImageData(0, 0, tw, th);
      for (let i = 0; i < tile.data.length; i += 4) { const n = (rnd() - 0.5) * 40; tile.data[i] += n; tile.data[i + 1] += n; tile.data[i + 2] += n; }
      const t = new OffscreenCanvas(tw, th); t.getContext('2d').putImageData(tile, 0, 0);
      x.globalAlpha = 0.35; x.fillStyle = x.createPattern(t, 'repeat'); x.fillRect(0, 0, w, h); x.globalAlpha = 1;
      // Orientation marker: red block top-left, blue block bottom-right.
      const m = Math.max(8, Math.round(Math.min(w, h) / 10));
      x.fillStyle = '#f00'; x.fillRect(0, 0, m * 2, m); x.fillStyle = '#00f'; x.fillRect(w - m, h - m, m, m);
    } else if (kind === 'detail') {
      const img = x.createImageData(w, h);
      for (let i = 0; i < img.data.length; i += 4) { const p = i / 4, X = p % w, Y = (p / w) | 0;
        img.data[i] = ((X ^ Y) & 0xff) * 0.6 + rnd() * 100; img.data[i + 1] = (Math.sin(X / 3) * 127 + 128) * 0.7 + rnd() * 70; img.data[i + 2] = ((X * Y) & 0xff) * 0.5 + rnd() * 120; img.data[i + 3] = 255; }
      x.putImageData(img, 0, 0);
    } else if (kind === 'document') {
      // Fake ID-like document: small text at several sizes + a fake signature. No real person/data.
      x.fillStyle = '#fbfaf5'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#1f3a93'; x.lineWidth = 3; x.strokeRect(20, 20, w - 40, h - 40);
      x.fillStyle = '#1f3a93'; x.font = 'bold 28px sans-serif'; x.fillText('SAMPLE DOCUMENT — NOT VALID — QA FIXTURE', 50, 75);
      x.fillStyle = '#222';
      let y = 120;
      for (const fs of [16, 13, 11, 10, 9, 8]) {
        x.font = `${fs}px sans-serif`;
        for (let k = 0; k < 4; k++) { x.fillText(`${fs}px  Name: Test Person ${k}  ·  No. QA-${(1000 + fs * 7 + k).toString()}-XYZ  ·  Date 01/02/2026  ·  0123456789 abcdefghijklmnopqrstuvwxyz`, 50, y); y += fs + 6; }
        y += 10;
      }
      x.strokeStyle = '#0a2a8a'; x.lineWidth = 1.6; x.beginPath();
      const sx = w - 520, sy = h - 140;
      x.moveTo(sx, sy);
      for (let t = 0; t < 1; t += 0.004) x.lineTo(sx + t * 420, sy + Math.sin(t * 38) * 28 * (1 - t) + Math.cos(t * 13) * 12);
      x.stroke();
      x.font = '10px sans-serif'; x.fillText('Signature (fake)', sx, sy + 60);
      x.lineWidth = 0.7; x.beginPath(); x.moveTo(sx, sy + 45); x.lineTo(sx + 430, sy + 45); x.stroke();
    } else if (kind === 'alpha') {
      x.clearRect(0, 0, w, h);
      x.fillStyle = 'rgba(0,128,0,1)'; x.beginPath(); x.arc(w * 0.65, h / 2, h * 0.4, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,0,255,0.5)'; x.fillRect(w * 0.5, 0, w * 0.1, h);
    } else if (kind === 'asym') {
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#f00'; x.fillRect(0, 0, w / 3, h / 3); x.fillStyle = '#00f'; x.fillRect(w * 5 / 6, h * 5 / 6, w / 6, h / 6);
    } else if (kind === 'numbered') {
      x.fillStyle = opts.color; x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff'; x.font = `bold ${Math.round(Math.min(w, h) * 0.6)}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(String(opts.n), w / 2, h / 2);
      x.fillStyle = '#000'; x.fillRect(0, 0, Math.round(w / 8), Math.round(h / 8)); // top-left corner marker
    } else if (kind === 'flat') {
      x.fillStyle = opts.color; x.fillRect(0, 0, w, h);
    }
    const blob = await c.convertToBlob({ type, quality });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(bin);
  }, { kind, w, h, type, quality, opts });
  return Buffer.from(b64, 'base64');
}

const J = 'image/jpeg', P = 'image/png', W = 'image/webp';
save('small.jpg', await draw('photo', 64, 48, J, 0.9, { seed: 2 }), { pixels: '64×48', traits: 'tiny photo', cases: 'C-io, P-mixed' });
save('portrait.jpg', await draw('photo', 1200, 1800, J, 0.9, { seed: 3 }), { pixels: '1200×1800', traits: 'portrait photo, orientation markers', cases: 'C-limit, P-pages' });
save('landscape.jpg', await draw('photo', 1800, 1200, J, 0.9, { seed: 4 }), { pixels: '1800×1200', traits: 'landscape photo', cases: 'C-limit, C-resize' });
save('panorama.jpg', await draw('photo', 6000, 1000, J, 0.9, { seed: 5 }), { pixels: '6000×1000', traits: 'panorama 6:1', cases: 'C-resize, P-fit' });
save('photo.png', await draw('photo', 640, 480, P, undefined, { seed: 6 }), { pixels: '640×480', traits: 'photo PNG', cases: 'C-io matrix' });
save('photo.webp', await draw('photo', 640, 480, W, 0.9, { seed: 7 }), { pixels: '640×480', traits: 'photo WebP lossy', cases: 'C-io matrix' });
save('photo-io.jpg', await draw('photo', 640, 480, J, 0.9, { seed: 8 }), { pixels: '640×480', traits: 'photo JPEG', cases: 'C-io matrix' });
save('detail.png', await draw('detail', 2000, 1500, P, undefined, { seed: 9 }), { pixels: '2000×1500', traits: 'high-frequency detail, compresses poorly', cases: 'C-impossible, timing' });
save('document.png', await draw('document', 1600, 1000, P), { pixels: '1600×1000', traits: 'fake document, text 8–16px, fake signature', cases: 'C-quality, P-text' });
save('transparent.png', await draw('alpha', 600, 400, P), { pixels: '600×400', traits: 'alpha: left half fully transparent, 50% magenta stripe', cases: 'C-alpha, P-alpha' });
save('transparent.webp', await draw('alpha', 600, 400, W, 1), { pixels: '600×400', traits: 'alpha WebP', cases: 'C-alpha' });
const asym = await draw('asym', 240, 120, J, 0.95);
for (const o of [3, 6, 8]) save(`exif-${o}.jpg`, withExif(asym, o), { pixels: '240×120 stored', traits: `EXIF Orientation ${o}; red top-left, blue bottom-right (stored)`, cases: 'C-exif, P-exif' });

const pageSpec = [
  { n: 1, color: '#d32f2f', w: 800, h: 1100, t: J, ext: 'jpg' },
  { n: 2, color: '#388e3c', w: 1100, h: 800, t: P, ext: 'png' },
  { n: 3, color: '#1976d2', w: 800, h: 1100, t: W, ext: 'webp' },
  { n: 4, color: '#f9a825', w: 1200, h: 700, t: J, ext: 'jpg' },
  { n: 5, color: '#7b1fa2', w: 700, h: 1000, t: P, ext: 'png' },
];
for (const p of pageSpec) save(`pages/page-${p.n}.${p.ext}`, await draw('numbered', p.w, p.h, p.t, 0.92, p), { pixels: `${p.w}×${p.h}`, traits: `page ${p.n}, ${p.color}, ${p.w > p.h ? 'landscape' : 'portrait'}, black top-left marker`, cases: 'P-order' });
save('dup-a/scan.png', await draw('flat', 400, 300, P, undefined, { color: '#00bcd4' }), { pixels: '400×300', traits: 'cyan; same name as dup-b/scan.png', cases: 'P-dup' });
save('dup-b/scan.png', await draw('flat', 300, 400, P, undefined, { color: '#ff5722' }), { pixels: '300×400', traits: 'orange; same name as dup-a/scan.png', cases: 'P-dup' });
save('ảnh-thử nghiệm 日本 😀.png', await draw('numbered', 500, 300, P, undefined, { n: 9, color: '#455a64' }), { pixels: '500×300', traits: 'Unicode/diacritics/emoji/space in name', cases: 'C-unicode, P-unicode' });

// 50 MP real image at the exact pixel limit (10000×5000 = 50,000,000 px).
save('limit-50mp-exact.jpg', await draw('photo', 10000, 5000, J, 0.85, { seed: 11 }), { pixels: '10000×5000 (50,000,000 px)', traits: 'real image exactly at pixel limit', cases: 'C-limit-px, P-limit-px' });
save('limit-48mp.jpg', await draw('photo', 8000, 6000, J, 0.85, { seed: 12 }), { pixels: '8000×6000 (48 MP)', traits: 'real image near pixel limit', cases: 'C-limit-px, timing' });
await browser.close();

// ---- Byte-crafted edge files ----
const port = readFileSync(join(OUT, 'portrait.jpg'));
save('empty.png', Buffer.alloc(0), { pixels: '-', traits: '0 bytes', cases: 'C-err, P-err' });
save('truncated.jpg', port.subarray(0, Math.floor(port.length * 0.4)), { pixels: '1200×1800 header', traits: 'first 40% of portrait.jpg (header valid, data cut)', cases: 'C-err, P-partial' });
save('truncated-99.jpg', port.subarray(0, port.length - 200), { pixels: '1200×1800 header', traits: 'portrait.jpg minus its last 200 bytes (EOI missing, almost complete)', cases: 'C21, P09' });
save('trailing-data.jpg', Buffer.concat([port, Buffer.from('TRAILER-DATA-AFTER-EOI'), Buffer.alloc(1000, 0x55)]), { pixels: '1200×1800', traits: 'valid JPEG + 1,022 bytes after EOI', cases: 'C22 (must be accepted)' });
// Progressive JPEG made with ImageMagick (only tool here that writes progressive). Recorded in the manifest; skipped if missing.
try {
  execFileSync('magick', [join(OUT, 'portrait.jpg'), '-interlace', 'JPEG', '-quality', '85', join(OUT, 'progressive.jpg')]);
  const pj = readFileSync(join(OUT, 'progressive.jpg'));
  rmSync(join(OUT, 'progressive.jpg'));
  save('progressive.jpg', pj, { pixels: '1200×1800', traits: 'progressive JPEG (SOF2, several scans), made by ImageMagick from portrait.jpg', cases: 'C22 (must be accepted)' });
  save('progressive-exif6.jpg', withExif(pj, 6), { pixels: '1200×1800 stored → 1800×1200', traits: 'progressive + EXIF Orientation 6', cases: 'C22 (must be accepted)' });
  save('progressive-truncated.jpg', pj.subarray(0, Math.floor(pj.length * 0.6)), { pixels: '1200×1800 header', traits: 'first 60% of progressive.jpg', cases: 'C21' });
} catch (e) {
  console.warn('ImageMagick not available: progressive fixtures skipped', e.message);
}
save('truncated.png', readFileSync(join(OUT, 'photo.png')).subarray(0, 268000), { pixels: '640×480 header', traits: 'first 40% of photo.png (IEND missing)', cases: 'C23, P16 (observation, outside B2 scope)' });
save('truncated.webp', readFileSync(join(OUT, 'photo.webp')).subarray(0, 40000), { pixels: '640×480 header', traits: 'first 46% of photo.webp', cases: 'C21, P09' });
save('jpeg-named.png', port, { pixels: '1200×1800', traits: 'JPEG bytes with .png extension', cases: 'C-wrongext' });
save('png-named.jpg', readFileSync(join(OUT, 'photo.png')), { pixels: '640×480', traits: 'PNG bytes with .jpg extension', cases: 'C-wrongext' });
const gif = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
save('unsupported.gif', gif, { pixels: '1×1', traits: 'GIF (out of scope)', cases: 'C-err, P-err' });
const bmp = Buffer.alloc(58); bmp.write('BM'); bmp.writeUInt32LE(58, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(1, 18); bmp.writeInt32LE(1, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28);
save('unsupported.bmp', bmp, { pixels: '1×1', traits: 'BMP (out of scope)', cases: 'C-err' });
save('notes.txt', Buffer.from('plain text, not an image\n'), { pixels: '-', traits: 'text', cases: 'C-err, P-err' });
save('heic-named.heic', Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(100)]), { pixels: '-', traits: 'HEIC-like ftyp box (out of scope)', cases: 'C-err' });

const small = makePng(200, 150, (x, y) => [x & 255, y & 255, 128, 255]);
save('bytes-50000000-exact.png', padTo(small, 50_000_000), { pixels: '200×150', traits: 'valid PNG zero-padded to exactly 50,000,000 bytes', cases: 'C-limit-bytes (accept)' });
save('bytes-50000001-over.png', padTo(small, 50_000_001), { pixels: '200×150', traits: 'valid PNG padded to 50,000,001 bytes', cases: 'C-limit-bytes (reject), P-limit-bytes' });
save('bytes-49900000.png', padTo(small, 49_900_000), { pixels: '200×150', traits: 'valid PNG padded to 49.9 MB (for 200 MB total)', cases: 'P-total' });
save('hdr-10000x5001.png', pngHeaderOnly(10000, 5001), { pixels: '10000×5001 (header only)', traits: '50,010,000 px: 1 row over pixel limit', cases: 'C-limit-px, P-limit-px' });
save('hdr-16384x100.jpg', jpegHeaderOnly(16384, 100), { pixels: '16384×100 (header only)', traits: 'side exactly at 16,384', cases: 'C-limit-side (accept at pick)' });
save('hdr-16385x100.jpg', jpegHeaderOnly(16385, 100), { pixels: '16385×100 (header only)', traits: 'side 1px over', cases: 'C-limit-side (reject)' });
save('real-16384x64.png', makePng(16384, 64, (x) => [x & 255, 90, 200, 255]), { pixels: '16384×64', traits: 'real image, side exactly at limit', cases: 'C-limit-side (process)' });
for (let i = 1; i <= 51; i++) {
  const hue = (i * 47) % 360;
  save(`many/img-${String(i).padStart(2, '0')}.png`, makePng(40, 30, () => [hue % 256, (i * 5) & 255, 255 - (hue % 256), 255]), { pixels: '40×30', traits: `tiny #${i}`, cases: 'P-count' });
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`${manifest.length} fixtures → ${OUT}`);
