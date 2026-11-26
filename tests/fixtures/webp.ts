/** WebP fixtures built from tests/fixtures/encoded.ts (no browser needed at test time). */
import { blueWebp, redWebp } from './encoded';

function riff(payload: Buffer): Buffer {
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(payload.length + 4, 4);
  head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, payload]);
}
function webpChunk(type: string, data: Buffer): Buffer {
  const h = Buffer.alloc(8);
  h.write(type, 0, 'latin1');
  h.writeUInt32LE(data.length, 4);
  return Buffer.concat([h, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}
/** The ALPH/VP8/VP8L chunks of a still WebP: what an ANMF frame contains. */
function imageChunks(webp: Buffer): Buffer {
  const parts: Buffer[] = [];
  let i = 12;
  while (i + 8 <= webp.length) {
    const type = webp.subarray(i, i + 4).toString('latin1');
    const len = webp.readUInt32LE(i + 4);
    const end = i + 8 + len + (len % 2);
    if (type === 'ALPH' || type === 'VP8 ' || type === 'VP8L') parts.push(webp.subarray(i, end));
    i = end;
  }
  return Buffer.concat(parts);
}
const u24 = (v: number) => Buffer.from([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff]);

/** Animated WebP, 120×60, 2 frames: frame 1 blue, frame 2 red (from the encoded fixtures). */
export function animatedWebp(): Buffer {
  const w = 120;
  const h = 60;
  const vp8x = Buffer.concat([Buffer.from([0x02, 0, 0, 0]), u24(w - 1), u24(h - 1)]); // animation flag
  const anim = Buffer.from([0, 0, 0, 0, 0, 0]); // background colour, loop forever
  const frame = (still: Buffer) => webpChunk('ANMF', Buffer.concat([u24(0), u24(0), u24(w - 1), u24(h - 1), u24(500), Buffer.from([0]), imageChunks(still)]));
  return riff(Buffer.concat([webpChunk('VP8X', vp8x), webpChunk('ANIM', anim), frame(blueWebp), frame(redWebp)]));
}
