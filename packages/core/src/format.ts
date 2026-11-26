export type ImageFormat = 'jpeg' | 'png' | 'webp';
export type FileFormat = ImageFormat | 'pdf';

export const MIME: Record<FileFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export const EXTENSION: Record<FileFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  pdf: 'pdf',
};

/** Detect the real format from magic bytes. Never trust MIME or extension. */
export function detectFormat(bytes: Uint8Array): FileFormat | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  )
    return 'png';
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  )
    return 'webp';
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d)
    return 'pdf';
  return null;
}

export function isImageFormat(f: FileFormat | null): f is ImageFormat {
  return f === 'jpeg' || f === 'png' || f === 'webp';
}

/** Lossy formats accept a quality parameter; PNG does not. */
export function isLossy(f: ImageFormat): boolean {
  return f !== 'png';
}

export function replaceExtension(name: string, f: FileFormat): string {
  const base = name.replace(/\.[^./\\]+$/, '') || 'file';
  return `${base}.${EXTENSION[f]}`;
}
