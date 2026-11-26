import { ErrorCodes, LovertError } from './errors.ts';
import { readDimensions } from './dimensions.ts';
import { detectFormat, isImageFormat, type ImageFormat } from './format.ts';
import { LIMITS } from './limits.ts';

export function validateImageBytes(bytes: Uint8Array): ImageFormat {
  if (bytes.length === 0) throw new LovertError(ErrorCodes.EMPTY_FILE, 'The file is empty.');
  if (bytes.length > LIMITS.maxInputBytes)
    throw new LovertError(ErrorCodes.FILE_TOO_LARGE, 'The file is larger than 50 MB.');
  const f = detectFormat(bytes);
  if (!isImageFormat(f))
    throw new LovertError(ErrorCodes.UNSUPPORTED_FORMAT, 'This is not a JPG, PNG or WebP image.');
  // Refuse oversized images from the header, before any decode allocates memory.
  const dims = readDimensions(bytes, f);
  if (dims) validateDimensions(dims.width, dims.height);
  return f;
}

export function validateDimensions(width: number, height: number): void {
  if (!(width > 0 && height > 0))
    throw new LovertError(ErrorCodes.DECODE_FAILED, 'The image could not be decoded.');
  if (width * height > LIMITS.maxPixels || width > LIMITS.maxCanvasSide || height > LIMITS.maxCanvasSide)
    throw new LovertError(
      ErrorCodes.TOO_MANY_PIXELS,
      `The image is ${width}×${height}px. The limit is 50 megapixels and 16,384px per side.`,
    );
}
