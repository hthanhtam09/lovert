import { describe, expect, it } from 'vitest';
import { makePng } from '../../../tests/fixtures/png';
import { ErrorCodes, readDimensions, validateImageBytes } from '../src/index.ts';

function jpegHeader(w: number, h: number, app1Len = 0): Uint8Array {
  const app = app1Len ? [0xff, 0xe1, (app1Len + 2) >> 8, (app1Len + 2) & 0xff, ...new Array(app1Len).fill(0)] : [];
  return Uint8Array.from([0xff, 0xd8, ...app, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 0xff, w >> 8, w & 0xff, 3, ...new Array(9).fill(0)]);
}
function webpVp8x(w: number, h: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46], 0);
  b.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 8);
  const W = w - 1, H = h - 1;
  b.set([W & 0xff, (W >> 8) & 0xff, (W >> 16) & 0xff, H & 0xff, (H >> 8) & 0xff, (H >> 16) & 0xff], 24);
  return b;
}

describe('readDimensions', () => {
  it('reads PNG, JPEG (after APP1) and WebP VP8X headers', () => {
    expect(readDimensions(makePng(7, 3, () => [0, 0, 0, 255]), 'png')).toEqual({ width: 7, height: 3 });
    expect(readDimensions(jpegHeader(4000, 3000, 5000), 'jpeg')).toEqual({ width: 4000, height: 3000 });
    expect(readDimensions(webpVp8x(9000, 6000), 'webp')).toEqual({ width: 9000, height: 6000 });
  });
  it('returns null on truncated headers', () => {
    expect(readDimensions(jpegHeader(10, 10, 5000).subarray(0, 100), 'jpeg')).toBeNull();
  });
  it('refuses oversized images before decoding', () => {
    expect(() => validateImageBytes(jpegHeader(8200, 6200))).toThrow(expect.objectContaining({ code: ErrorCodes.TOO_MANY_PIXELS }));
    expect(() => validateImageBytes(webpVp8x(17000, 100))).toThrow(expect.objectContaining({ code: ErrorCodes.TOO_MANY_PIXELS }));
    expect(validateImageBytes(jpegHeader(8000, 6250))).toBe('jpeg'); // exactly 50 MP is allowed
  });
});
