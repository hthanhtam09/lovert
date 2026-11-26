/**
 * User-facing messages shared by the tools and the Help page, so both always say the same thing.
 * Limits come from @lovert/core.
 */
import { LIMITS } from '@lovert/core';

const MP = LIMITS.maxPixels / 1_000_000;
const SIDE = LIMITS.maxCanvasSide.toLocaleString('en-US');

export const PIXEL_LIMIT_TEXT = `${MP} megapixels and ${SIDE}px per side`;

export const WEBP_UNAVAILABLE =
  'WebP is unavailable: this browser returned a different format when asked to create a WebP sample. JPEG and PNG work.';

export function pixelLimitMessage(width: number, height: number): string {
  return `This image is ${width}×${height}px (${((width * height) / 1e6).toFixed(1)} MP). The limit is ${PIXEL_LIMIT_TEXT}, so phones don't run out of memory. Resize it first or choose another image.`;
}

export function pdfPixelLimitReason(name: string, width: number, height: number): string {
  return `${name} (${width}×${height}px, over the ${MP} megapixel / ${SIDE}px limit)`;
}

export const PDF_OVER_LIMIT_FULL_RES =
  'At full resolution the PDF is too large even at low quality. Turn on "Allow lower image resolution" (text gets softer) or raise the limit.';
export const PDF_OVER_LIMIT_LOWEST =
  'Even at the lowest quality and resolution this PDF is too large. Remove some images or raise the limit.';
