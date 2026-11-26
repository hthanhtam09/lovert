/**
 * Canvas adapter. Uses OffscreenCanvas when available (worker or main thread),
 * otherwise an HTMLCanvasElement (main-thread fallback only).
 */
import { detectFormat, ErrorCodes, LovertError } from '@lovert/core';

export type Drawable = ImageBitmap | HTMLImageElement;

export interface Surface {
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  encode(type: string, quality?: number): Promise<Uint8Array>;
}

export function createSurface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext('2d');
    if (!ctx) throw new LovertError(ErrorCodes.BROWSER_UNSUPPORTED, 'Canvas 2D is not available.');
    return {
      ctx,
      async encode(type, quality) {
        const blob = await c.convertToBlob({ type, quality });
        return new Uint8Array(await blob.arrayBuffer());
      },
    };
  }
  if (typeof document === 'undefined')
    throw new LovertError(ErrorCodes.BROWSER_UNSUPPORTED, 'No canvas available in this context.');
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new LovertError(ErrorCodes.BROWSER_UNSUPPORTED, 'Canvas 2D is not available.');
  return {
    ctx,
    encode: (type, quality) =>
      new Promise((resolve, reject) =>
        c.toBlob(
          (b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new LovertError(ErrorCodes.ENCODE_FAILED, 'Encoding failed.'))),
          type,
          quality,
        ),
      ),
  };
}

export async function decode(bytes: Uint8Array, mime: string): Promise<{ img: Drawable; width: number; height: number; close(): void }> {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  try {
    if (typeof createImageBitmap === 'function') {
      // 'from-image' applies EXIF orientation so the output is upright.
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { img: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    if (e instanceof LovertError) throw e;
    throw new LovertError(ErrorCodes.DECODE_FAILED, 'The image could not be decoded. It may be damaged.');
  }
}

/** Samples a downscaled copy to detect transparency without a full-size getImageData. */
export function hasAlpha(img: Drawable, width: number, height: number): boolean {
  const s = Math.min(1, 256 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * s));
  const h = Math.max(1, Math.round(height * s));
  const { ctx } = createSurface(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true;
  return false;
}

export function render(img: Drawable, width: number, height: number, background: string | null): Surface {
  const surface = createSurface(width, height);
  const { ctx } = surface;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return surface;
}

/**
 * Encode a tiny sample with the same encoder path used for real jobs and check the
 * output bytes. Browsers that cannot encode a type silently return PNG instead.
 */
export async function probeEncoders(): Promise<Record<'jpeg' | 'png' | 'webp', boolean>> {
  const s = createSurface(4, 4);
  s.ctx.fillStyle = '#3a7';
  s.ctx.fillRect(0, 0, 4, 4);
  const test = async (type: string, fmt: 'jpeg' | 'png' | 'webp') => {
    try {
      return detectFormat(await s.encode(type, 0.8)) === fmt;
    } catch {
      return false;
    }
  };
  return { jpeg: await test('image/jpeg', 'jpeg'), png: await test('image/png', 'png'), webp: await test('image/webp', 'webp') };
}
