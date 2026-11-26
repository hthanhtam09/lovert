/** Deterministic PNG generator for fixtures (no binary files in git). */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** RGBA PNG. `pixel(x,y)` returns [r,g,b,a]. */
export function makePng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
}

/** Noisy photo-like gradient: compresses poorly, good for size-limit tests. Seeded → deterministic. */
export function noisyPng(width: number, height: number, seed = 1, alpha = false): Buffer {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 60;
  return makePng(width, height, (x, y) => [
    (x * 255) / width + rnd() | 0, (y * 255) / height + rnd() | 0, 128 + rnd() | 0,
    alpha && (x < width / 4) ? 0 : 255,
  ].map((v) => Math.max(0, Math.min(255, v))) as [number, number, number, number]);
}

/** Solid colour with a big number drawn as blocks, so page order can be checked visually. */
export function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  return makePng(width, height, () => [...rgb, 255]);
}

/**
 * Real 2-frame APNG, w×h. Frame 1 (also the default image, IDAT) is solid `first`; frame 2 (fdAT) is solid `second`.
 * Decoders that ignore animation show frame 1; a converter that keeps one frame must keep frame 1.
 */
export function apng(width: number, height: number, first: [number, number, number], second: [number, number, number]): Buffer {
  const still = (rgb: [number, number, number]) => solidPng(width, height, rgb);
  const idatOf = (png: Buffer) => {
    let i = 8;
    for (;;) {
      const len = png.readUInt32BE(i);
      if (png.subarray(i + 4, i + 8).toString('latin1') === 'IDAT') return png.subarray(i + 8, i + 8 + len);
      i += 12 + len;
    }
  };
  const fctl = (seq: number) => {
    const b = Buffer.alloc(26);
    b.writeUInt32BE(seq, 0);
    b.writeUInt32BE(width, 4);
    b.writeUInt32BE(height, 8);
    b.writeUInt16BE(50, 20); // delay 50/100 s
    b.writeUInt16BE(100, 22);
    return b;
  };
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(2, 0); // 2 frames, loop forever
  const base = still(first);
  const ihdrEnd = 8 + 12 + 13;
  const seq2 = Buffer.alloc(4);
  seq2.writeUInt32BE(2);
  return Buffer.concat([
    base.subarray(0, ihdrEnd),
    chunk('acTL', actl),
    chunk('fcTL', fctl(0)),
    chunk('IDAT', idatOf(base)),
    chunk('fcTL', fctl(1)),
    chunk('fdAT', Buffer.concat([seq2, idatOf(still(second))])),
    chunk('IEND', new Uint8Array()),
  ]);
}
