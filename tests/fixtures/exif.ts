/** Insert a minimal EXIF APP1 segment with an Orientation tag right after the JPEG SOI marker. */
export function withExifOrientation(jpeg: Buffer, orientation: 1 | 3 | 6 | 8): Buffer {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG');
  // TIFF big-endian header, IFD0 with one entry: 0x0112 SHORT 1 = orientation.
  const tiff = Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    0x00, 0x01,
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const len = payload.length + 2;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, len >> 8, len & 0xff]), payload]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

/** Fake JPEG: valid SOI + SOF header announcing w×h, garbage after. Only the header is real. */
export function jpegHeaderOnly(width: number, height: number): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3]),
    Buffer.alloc(9),
    Buffer.alloc(2000, 0x55),
  ]);
}
