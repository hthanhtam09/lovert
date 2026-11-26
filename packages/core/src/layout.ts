/** PDF page layout in PostScript points (1/72 inch). Pure math, no PDF library. */
export type PageSizeId = 'a4' | 'letter' | 'fit';

export const PAGE_SIZES: Record<Exclude<PageSizeId, 'fit'>, { width: number; height: number; label: string }> = {
  a4: { width: 595.28, height: 841.89, label: 'A4 (210 × 297 mm)' },
  letter: { width: 612, height: 792, label: 'US Letter (8.5 × 11 in)' },
};

export interface Placement {
  pageWidth: number;
  pageHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Fit an image inside a page, keeping aspect ratio and never cropping.
 * Paper orientation follows the image (landscape image → landscape page).
 * 'fit' makes the page the image size at 96 DPI.
 */
export function placeImage(page: PageSizeId, imgW: number, imgH: number, marginPt: number): Placement {
  if (!(imgW > 0 && imgH > 0)) throw new RangeError('Image size must be positive');
  if (page === 'fit') {
    const w = (imgW * 72) / 96;
    const h = (imgH * 72) / 96;
    return { pageWidth: w + 2 * marginPt, pageHeight: h + 2 * marginPt, x: marginPt, y: marginPt, width: w, height: h };
  }
  const base = PAGE_SIZES[page];
  const landscape = imgW > imgH;
  const pageWidth = landscape ? base.height : base.width;
  const pageHeight = landscape ? base.width : base.height;
  const boxW = Math.max(1, pageWidth - 2 * marginPt);
  const boxH = Math.max(1, pageHeight - 2 * marginPt);
  const s = Math.min(boxW / imgW, boxH / imgH);
  const width = imgW * s;
  const height = imgH * s;
  return { pageWidth, pageHeight, x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
}

/** Move one item in a list; used for keyboard-accessible reordering. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return [...list];
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}
