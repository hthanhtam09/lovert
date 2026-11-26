import { describe, expect, it } from 'vitest';
import {
  createJobGuard, detectFormat, ErrorCodes, formatBytes, LovertError, moveItem, placeImage,
  replaceExtension, searchCandidate, sizeBucket, toBytes, validateDimensions, validateImageBytes, verifyOutput,
} from '../src/index.ts';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

describe('units', () => {
  it('uses 1 KB = 1000 bytes', () => {
    expect(toBytes(50, 'KB')).toBe(50_000);
    expect(toBytes(1, 'MB')).toBe(1_000_000);
  });
  it('rounds display up so over-limit never looks like it fits', () => {
    expect(formatBytes(50_000)).toBe('50.0 KB');
    expect(formatBytes(50_001)).toBe('50.1 KB');
    expect(formatBytes(1_000_001)).toBe('1.01 MB');
    expect(formatBytes(999)).toBe('999 B');
  });
  it('rejects bad sizes', () => expect(() => toBytes(0, 'KB')).toThrow());
  it('buckets sizes coarsely', () => expect(sizeBucket(123_456)).toBe('100-500KB'));
});

describe('format detection', () => {
  it('reads magic bytes', () => {
    expect(detectFormat(PNG)).toBe('png');
    expect(detectFormat(JPG)).toBe('jpeg');
    expect(detectFormat(WEBP)).toBe('webp');
    expect(detectFormat(PDF)).toBe('pdf');
    expect(detectFormat(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it('replaces extensions', () => expect(replaceExtension('my.photo.PNG', 'jpeg')).toBe('my.photo.jpg'));
});

describe('validation', () => {
  it('rejects empty, wrong format', () => {
    expect(() => validateImageBytes(new Uint8Array())).toThrow(expect.objectContaining({ code: ErrorCodes.EMPTY_FILE }));
    expect(() => validateImageBytes(PDF)).toThrow(expect.objectContaining({ code: ErrorCodes.UNSUPPORTED_FORMAT }));
    expect(validateImageBytes(WEBP)).toBe('webp');
  });
  it('rejects too many pixels', () => {
    expect(() => validateDimensions(10_000, 10_000)).toThrow(LovertError);
    expect(() => validateDimensions(4000, 3000)).not.toThrow();
  });
});

describe('verifyOutput', () => {
  const bytes = new Uint8Array(1000);
  bytes.set(JPG);
  it('passes exactly at the limit', () => {
    const c = verifyOutput({ bytes, requestedFormat: 'jpeg', limitBytes: 1000 });
    expect(c.every((x) => x.pass)).toBe(true);
  });
  it('fails one byte over the limit', () => {
    const c = verifyOutput({ bytes, requestedFormat: 'jpeg', limitBytes: 999 });
    expect(c.find((x) => x.id === 'size')?.pass).toBe(false);
  });
  it('flags when the browser returned another format', () => {
    const png = new Uint8Array(100);
    png.set(PNG);
    const c = verifyOutput({ bytes: png, requestedFormat: 'webp' });
    expect(c[0]).toMatchObject({ id: 'format', pass: false });
  });
  it('checks dimensions and pages', () => {
    const c = verifyOutput({
      bytes, requestedFormat: 'jpeg', expected: { width: 10, height: 10 }, actual: { width: 10, height: 9 },
      expectedPages: 3, actualPages: 3,
    });
    expect(c.find((x) => x.id === 'dimensions')?.pass).toBe(false);
    expect(c.find((x) => x.id === 'pages')?.pass).toBe(true);
  });
});

/** Fake encoder: size proportional to quality × pixels. Deterministic. */
const fake = (base: number) => async (q: number | undefined, s: number) =>
  new Uint8Array(Math.round(base * (q ?? 1) * s * s));

describe('searchCandidate', () => {
  it('picks highest quality that fits', async () => {
    const r = await searchCandidate({ encode: fake(100_000), lossy: true, limitBytes: 50_000, allowResize: false, minScale: 0.1 });
    expect(r.fits).toBe(true);
    expect(r.best.bytes.length).toBeLessThanOrEqual(50_000);
    expect(r.best.quality).toBeGreaterThan(0.45);
    expect(r.best.scale).toBe(1);
  });
  it('accepts a result exactly at the limit', async () => {
    const r = await searchCandidate({ encode: async () => new Uint8Array(500), lossy: false, limitBytes: 500, allowResize: false, minScale: 0.1 });
    expect(r.fits).toBe(true);
  });
  it('reports over limit and never resizes without permission', async () => {
    const r = await searchCandidate({ encode: fake(100_000), lossy: true, limitBytes: 10_000, allowResize: false, minScale: 0.1 });
    expect(r.fits).toBe(false);
    expect(r.best.scale).toBe(1);
  });
  it('resizes when allowed', async () => {
    const r = await searchCandidate({ encode: fake(100_000), lossy: true, limitBytes: 10_000, allowResize: true, minScale: 0.05 });
    expect(r.fits).toBe(true);
    expect(r.best.scale).toBeLessThan(1);
  });
  it('can be cancelled', async () => {
    await expect(
      searchCandidate({ encode: fake(1), lossy: true, limitBytes: 1, allowResize: false, minScale: 1, isCancelled: () => true }),
    ).rejects.toMatchObject({ code: ErrorCodes.CANCELLED });
  });
});

describe('layout', () => {
  it('fits without cropping and keeps ratio', () => {
    const p = placeImage('a4', 4000, 1000, 36);
    expect(p.pageWidth).toBeGreaterThan(p.pageHeight); // landscape
    expect(p.width / p.height).toBeCloseTo(4, 5);
    expect(p.x).toBeGreaterThanOrEqual(36);
    expect(p.x + p.width).toBeLessThanOrEqual(p.pageWidth - 36 + 1e-6);
  });
  it('fit page uses image size', () => {
    expect(placeImage('fit', 96, 192, 0)).toMatchObject({ pageWidth: 72, pageHeight: 144 });
  });
  it('moves items', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});

describe('job guard', () => {
  it('discards stale jobs', () => {
    const g = createJobGuard();
    const a = g.start();
    const b = g.start();
    expect(g.isCurrent(a)).toBe(false);
    expect(g.isCurrent(b)).toBe(true);
  });
});

describe('size limit boundary (100 KB)', () => {
  const limit = toBytes(100, 'KB');
  it('100,000 bytes passes and 100,001 bytes fails', () => {
    expect(limit).toBe(100_000);
    const at = new Uint8Array(100_000); at.set([0xff, 0xd8, 0xff]);
    const over = new Uint8Array(100_001); over.set([0xff, 0xd8, 0xff]);
    expect(verifyOutput({ bytes: at, requestedFormat: 'jpeg', limitBytes: limit }).find((c) => c.id === 'size')!.pass).toBe(true);
    expect(verifyOutput({ bytes: over, requestedFormat: 'jpeg', limitBytes: limit }).find((c) => c.id === 'size')!.pass).toBe(false);
  });
});
