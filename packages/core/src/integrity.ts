import { ErrorCodes, LovertError } from './errors.ts';
import type { ImageFormat } from './format.ts';

export type JpegStructure =
  | { ok: true; progressive: boolean; scans: number; endOffset: number }
  | { ok: false; reason: 'not-jpeg' | 'truncated' | 'bad-marker' | 'no-image-data' };

const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

/**
 * Walk the whole JPEG marker structure, including the entropy-coded data after every SOS
 * (byte stuffing FF00, restart markers, fill bytes), until EOI.
 * Catches files that end early (download/copy cut off), which some browsers decode partially
 * without an error (WebKit fills grey, Firefox white). Accepts baseline and progressive JPEG,
 * EXIF/APPn segments and any data after EOI.
 * Limits: it checks structure, not the Huffman-coded values themselves; a file corrupted in the
 * middle of the scan data with an intact structure is not detected here.
 */
export function checkJpegStructure(b: Uint8Array): JpegStructure {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return { ok: false, reason: 'not-jpeg' };
  let i = 2;
  let sof = false;
  let progressive = false;
  let scans = 0;
  for (;;) {
    if (i >= b.length) return { ok: false, reason: 'truncated' };
    if (b[i] !== 0xff) return { ok: false, reason: 'bad-marker' };
    while (i < b.length && b[i] === 0xff) i++; // fill bytes before a marker
    if (i >= b.length) return { ok: false, reason: 'truncated' };
    const m = b[i++]!;
    if (m === 0xd9) return sof && scans > 0 ? { ok: true, progressive, scans, endOffset: i } : { ok: false, reason: 'no-image-data' };
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue; // standalone markers
    if (m === 0x00 || m === 0xd8) return { ok: false, reason: 'bad-marker' };
    if (i + 2 > b.length) return { ok: false, reason: 'truncated' };
    const len = (b[i]! << 8) | b[i + 1]!;
    if (len < 2) return { ok: false, reason: 'bad-marker' };
    const end = i + len;
    if (end > b.length) return { ok: false, reason: 'truncated' };
    if (isSof(m)) {
      sof = true;
      if (m === 0xc2 || m === 0xc6 || m === 0xca || m === 0xce) progressive = true;
    }
    if (m !== 0xda) {
      i = end;
      continue;
    }
    if (!sof) return { ok: false, reason: 'bad-marker' };
    scans++;
    // Entropy-coded segment: runs until a marker other than FF00 / RSTn.
    let j = end;
    for (;;) {
      if (j + 1 >= b.length) return { ok: false, reason: 'truncated' };
      if (b[j] !== 0xff) {
        j++;
        continue;
      }
      const n = b[j + 1]!;
      if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) j += 2;
      else if (n === 0xff) j += 1;
      else break;
    }
    i = j;
  }
}

/**
 * PNG: walk every chunk (length + type + data + CRC) from the signature to IEND.
 * Catches files that end early. Data after IEND is accepted. CRCs are not verified.
 */
export function checkPngStructure(b: Uint8Array): { ok: true; endOffset: number } | { ok: false; reason: 'not-png' | 'truncated' | 'bad-chunk' | 'no-image-data' } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 8 || sig.some((v, k) => b[k] !== v)) return { ok: false, reason: 'not-png' };
  let i = 8;
  let first = true;
  let idat = false;
  for (;;) {
    if (i + 8 > b.length) return { ok: false, reason: 'truncated' };
    const len = ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
    const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!);
    if (!/^[A-Za-z]{4}$/.test(type) || (first && type !== 'IHDR')) return { ok: false, reason: 'bad-chunk' };
    first = false;
    const end = i + 12 + len;
    if (end > b.length) return { ok: false, reason: 'truncated' };
    if (type === 'IDAT') idat = true;
    if (type === 'IEND') return idat ? { ok: true, endOffset: end } : { ok: false, reason: 'no-image-data' };
    i = end;
  }
}

/** WebP: the RIFF header states the file size; a file shorter than that was cut off. */
export function checkWebpStructure(b: Uint8Array): { ok: true } | { ok: false; reason: 'not-webp' | 'truncated' } {
  if (b.length < 12) return { ok: false, reason: 'not-webp' };
  const riff = (b[4]! | (b[5]! << 8) | (b[6]! << 16) | (b[7]! << 24)) >>> 0;
  return b.length >= riff + 8 ? { ok: true } : { ok: false, reason: 'truncated' };
}

/**
 * Whole-file integrity check, run on the full bytes before a result can be shown as a success
 * or an image embedded in a PDF. Some browsers decode cut-off files partially without an error
 * (WebKit/Firefox: grey/white/transparent rows). Structure only: corrupted data inside an intact
 * structure is left to the decoder.
 */
export function checkImageIntegrity(bytes: Uint8Array, format: ImageFormat): void {
  const r = format === 'jpeg' ? checkJpegStructure(bytes) : format === 'png' ? checkPngStructure(bytes) : checkWebpStructure(bytes);
  if (r.ok) return;
  const name = format === 'jpeg' ? 'JPEG' : format === 'png' ? 'PNG' : 'WebP';
  throw new LovertError(
    ErrorCodes.DECODE_FAILED,
    r.reason === 'truncated'
      ? `This ${name} is incomplete: the file ends before the image data does. It may have been cut off while downloading or copying.`
      : `This ${name} is damaged and cannot be read reliably.`,
  );
}

/**
 * Whether the image can contain transparency, read from the header bytes (not from the name or MIME type).
 * PNG: colour type with alpha or a tRNS chunk before IDAT. WebP: VP8X alpha flag or lossless (VP8L).
 * `bytes` only needs the start of the file (HEADER_PROBE_BYTES).
 */
export function mayHaveAlpha(bytes: Uint8Array, format: ImageFormat): boolean {
  const b = bytes;
  if (format === 'jpeg') return false;
  if (format === 'png') {
    if (b.length < 26) return true;
    const colorType = b[25]!;
    if (colorType === 4 || colorType === 6) return true;
    let i = 8;
    while (i + 8 <= b.length) {
      const len = ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
      const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!);
      if (type === 'tRNS') return true;
      if (type === 'IDAT' || type === 'IEND') return false;
      i += 12 + len;
    }
    return true; // header not fully available: assume it may
  }
  if (b.length < 21) return true;
  const tag = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
  if (tag === 'VP8X') return (b[20]! & 0x10) !== 0;
  if (tag === 'VP8L') return true; // lossless WebP: alpha hint is not reliable, so assume it may
  return false; // simple lossy VP8: no alpha
}

/**
 * Whether the file is animated, read from the header bytes: APNG has an `acTL` chunk before the first IDAT,
 * animated WebP sets the VP8X animation flag. Canvas output keeps only the first frame, so the UI says so before converting.
 */
export function isAnimated(bytes: Uint8Array, format: ImageFormat): boolean {
  const b = bytes;
  if (format === 'png') {
    let i = 8;
    while (i + 8 <= b.length) {
      const len = ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
      const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!);
      if (type === 'acTL') return true;
      if (type === 'IDAT' || type === 'IEND') return false;
      i += 12 + len;
    }
    return false;
  }
  if (format === 'webp') {
    if (b.length < 21) return false;
    const tag = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    return tag === 'VP8X' && (b[20]! & 0x02) !== 0;
  }
  return false;
}
