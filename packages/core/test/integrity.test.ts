import { describe, expect, it } from 'vitest';
import { checkImageIntegrity, checkJpegStructure, checkPngStructure, checkWebpStructure, ErrorCodes, formatBytes, mayHaveAlpha, toBytes } from '../src/index.ts';

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const SOF = (m: number) => seg(m, [8, 0, 16, 0, 16, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
const DHT = seg(0xc4, [0, ...new Array(16).fill(0)]);
const DQT = seg(0xdb, [0, ...new Array(64).fill(1)]);
const SOS = seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]);
const EXIF = seg(0xe1, [...Buffer.from('Exif\0\0'), 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 1, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]);
// Entropy data with byte stuffing (FF00), a restart marker (FFD0) and fill bytes (FFFF) before the next marker.
const SCAN = [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a, 0xff, 0x00, 0xbc];

const baseline = Uint8Array.from([0xff, 0xd8, ...EXIF, ...DQT, ...SOF(0xc0), ...DHT, ...SOS, ...SCAN, 0xff, 0xff, 0xd9]);
const progressive = Uint8Array.from([
  0xff, 0xd8, ...DQT, ...SOF(0xc2), ...DHT, ...SOS, ...SCAN, ...DHT, ...SOS, ...SCAN, ...SOS, 0x01, 0x02, 0xff, 0xd9,
]);

describe('checkJpegStructure', () => {
  it('accepts baseline JPEG with EXIF, stuffing, restart markers and fill bytes', () => {
    expect(checkJpegStructure(baseline)).toMatchObject({ ok: true, progressive: false, scans: 1 });
  });
  it('accepts progressive JPEG with several scans and tables between them', () => {
    expect(checkJpegStructure(progressive)).toMatchObject({ ok: true, progressive: true, scans: 3 });
  });
  it('accepts data after EOI (trailers some cameras and editors append)', () => {
    const r = checkJpegStructure(Uint8Array.from([...baseline, 0, 1, 2, 0xff, 0xd8, 9, 9]));
    expect(r).toMatchObject({ ok: true, endOffset: baseline.length });
  });
  it('rejects the file cut at every possible position (never a false OK)', () => {
    for (const f of [baseline, progressive])
      for (let n = 0; n < f.length - 1; n++) expect(checkJpegStructure(f.subarray(0, n)).ok, `cut at ${n}`).toBe(false);
  });
  it('rejects a file without scan data, a missing SOI, and an invalid marker', () => {
    expect(checkJpegStructure(Uint8Array.from([0xff, 0xd8, ...DQT, 0xff, 0xd9]))).toMatchObject({ ok: false, reason: 'no-image-data' });
    expect(checkJpegStructure(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toMatchObject({ ok: false, reason: 'not-jpeg' });
    expect(checkJpegStructure(Uint8Array.from([0xff, 0xd8, 0x12, 0x34]))).toMatchObject({ ok: false, reason: 'bad-marker' });
  });
  it('checkImageIntegrity throws DECODE_FAILED for a truncated JPEG and a non-PNG', () => {
    expect(() => checkImageIntegrity(baseline.subarray(0, 60), 'jpeg')).toThrow(expect.objectContaining({ code: ErrorCodes.DECODE_FAILED }));
    expect(() => checkImageIntegrity(baseline, 'jpeg')).not.toThrow();
    expect(() => checkImageIntegrity(new Uint8Array(3), 'png')).toThrow();
  });
});

describe('mayHaveAlpha (from bytes, not name/MIME)', () => {
  const png = (colorType: number, extra: number[] = []) =>
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, colorType, 0, 0, 0, 1, 2, 3, 4, ...extra]);
  const idat = [0, 0, 0, 0, 0x49, 0x44, 0x41, 0x54, 0, 0, 0, 0];
  const trns = [0, 0, 0, 2, 0x74, 0x52, 0x4e, 0x53, 0, 0, 1, 2, 3, 4];
  it('PNG colour types and tRNS', () => {
    expect(mayHaveAlpha(png(6, idat), 'png')).toBe(true);
    expect(mayHaveAlpha(png(4, idat), 'png')).toBe(true);
    expect(mayHaveAlpha(png(2, idat), 'png')).toBe(false);
    expect(mayHaveAlpha(png(2, [...trns, ...idat]), 'png')).toBe(true);
  });
  it('JPEG never, WebP by chunk type', () => {
    expect(mayHaveAlpha(new Uint8Array(30), 'jpeg')).toBe(false);
    const webp = (tag: string, flags = 0) => Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), ...Buffer.from(tag), 0, 0, 0, 0, flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(mayHaveAlpha(webp('VP8X', 0x10), 'webp')).toBe(true);
    expect(mayHaveAlpha(webp('VP8X', 0), 'webp')).toBe(false);
    expect(mayHaveAlpha(webp('VP8 '), 'webp')).toBe(false);
  });
});

describe('toBytes: exact decimal parsing (B8)', () => {
  it('1.005 KB is exactly 1,005 bytes, as text or number', () => {
    expect(toBytes('1.005', 'KB')).toBe(1005);
    expect(toBytes(1.005, 'KB')).toBe(1005);
  });
  it('every b/1000 KB for 1..199,999 bytes maps back to b', () => {
    for (let b = 1; b < 200_000; b++) {
      expect(toBytes(String(b / 1000), 'KB')).toBe(b);
      expect(toBytes(b / 1000, 'KB')).toBe(b);
    }
  });
  it('drops fractions smaller than one byte (floor) and refuses < 1 byte', () => {
    expect(toBytes('12.3456', 'KB')).toBe(12_345);
    expect(toBytes('1.0000001', 'MB')).toBe(1_000_000);
    expect(() => toBytes('0.0009', 'KB')).toThrow(RangeError);
    expect(toBytes('0.001', 'KB')).toBe(1);
  });
  it('accepts forms the UI accepted before (exponent, leading zeros, spaces) and refuses others', () => {
    expect(toBytes('1e2', 'KB')).toBe(100_000);
    expect(toBytes(' 050 ', 'KB')).toBe(50_000);
    expect(toBytes('.5', 'MB')).toBe(500_000);
    for (const bad of ['', 'abc', '-5', '1,5', '0', '1e', 'Infinity']) expect(() => toBytes(bad, 'KB'), bad).toThrow(RangeError);
  });
});

describe('formatBytes near unit boundaries (B9)', () => {
  it('never shows "1000.0 KB"; rounding up still never understates', () => {
    for (let b = 999_000; b < 1_000_000; b++) expect(formatBytes(b)).not.toBe('1000.0 KB');
    expect(formatBytes(999_999)).toBe('1.00 MB');
    expect(formatBytes(999_900)).toBe('999.9 KB');
    expect(formatBytes(999_901)).toBe('1.00 MB');
    expect(formatBytes(1_000_000)).toBe('1.00 MB');
  });
});

describe('PNG and WebP structure (B2 extended)', () => {
  const chunk = (type: string, data: number[]) => [0, 0, (data.length >> 8) & 255, data.length & 255, ...Buffer.from(type), ...data, 1, 2, 3, 4];
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const png = Uint8Array.from([...sig, ...chunk('IHDR', new Array(13).fill(1)), ...chunk('IDAT', [1, 2, 3]), ...chunk('IDAT', [4]), ...chunk('IEND', [])]);
  it('accepts a complete PNG, also with data after IEND', () => {
    expect(checkPngStructure(png).ok).toBe(true);
    expect(checkPngStructure(Uint8Array.from([...png, ...new Array(100).fill(0)])).ok).toBe(true);
  });
  it('rejects the PNG cut at every position', () => {
    for (let n = 0; n < png.length; n++) expect(checkPngStructure(png.subarray(0, n)).ok, `cut at ${n}`).toBe(false);
  });
  it('WebP: shorter than the RIFF size is truncated', () => {
    const w = Uint8Array.from([...Buffer.from('RIFF'), 20, 0, 0, 0, ...Buffer.from('WEBP'), ...new Array(16).fill(0)]);
    expect(checkWebpStructure(w).ok).toBe(true);
    expect(checkWebpStructure(w.subarray(0, 27)).ok).toBe(false);
    expect(() => checkImageIntegrity(w.subarray(0, 20), 'webp')).toThrow(expect.objectContaining({ code: ErrorCodes.DECODE_FAILED }));
    expect(() => checkImageIntegrity(png.subarray(0, 30), 'png')).toThrow(/PNG is incomplete/);
  });
});
