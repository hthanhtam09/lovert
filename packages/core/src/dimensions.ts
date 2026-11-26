import type { ImageFormat } from './format.ts';

/**
 * Read pixel dimensions from the file header without decoding, so oversized
 * images can be refused before the browser allocates a bitmap.
 * Returns null when the header is not in `bytes` (e.g. truncated read) or is malformed.
 * EXIF orientation may swap width/height on display; pixel count and side limits are unaffected.
 */
export function readDimensions(b: Uint8Array, format: ImageFormat): { width: number; height: number } | null {
  const u16be = (i: number) => (b[i]! << 8) | b[i + 1]!;
  const u32be = (i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
  if (format === 'png') {
    if (b.length < 24) return null;
    return { width: u32be(16), height: u32be(20) };
  }
  if (format === 'webp') {
    if (b.length < 30) return null;
    const tag = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (tag === 'VP8 ') return { width: ((b[27]! << 8) | b[26]!) & 0x3fff, height: ((b[29]! << 8) | b[28]!) & 0x3fff };
    if (tag === 'VP8L') {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (tag === 'VP8X')
      return { width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)) };
    return null;
  }
  // JPEG: walk markers to the first SOFn.
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1]!;
    if (m === 0xff) {
      i++;
      continue;
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: u16be(i + 7), height: u16be(i + 5) };
    if (m === 0xd9 || m === 0xda) return null;
    i += 2 + u16be(i + 2);
  }
  return null;
}

/** Bytes to read from the start of a file to find the header (JPEG EXIF/thumbnails can push SOF far in). */
export const HEADER_PROBE_BYTES = 256 * 1024;
