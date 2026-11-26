import {
  checkImageIntegrity, ErrorCodes, LIMITS, LovertError, MIME, searchCandidate, toErrorCode, validateDimensions,
  validateImageBytes, verifyOutput, type ConversionResult, type PageSizeId,
} from '@lovert/core';
import { PDF_OVER_LIMIT_FULL_RES, PDF_OVER_LIMIT_LOWEST } from '@/content/messages';
import { decode, render } from '../image/surface';
import { buildPdf, countPages, type PdfPageImage } from './build';

export interface ImagesToPdfOptions {
  page: PageSizeId;
  marginPt: number;
  limitBytes?: number | undefined;
  allowResize: boolean;
}

export async function imagesToPdf(
  inputs: Uint8Array[],
  opts: ImagesToPdfOptions,
  hooks: { onProgress?: (step: number) => void; isCancelled?: () => boolean } = {},
): Promise<ConversionResult> {
  try {
    if (inputs.length === 0) throw new LovertError(ErrorCodes.EMPTY_FILE, 'Add at least one image.');
    if (inputs.length > LIMITS.maxPdfImages)
      throw new LovertError(ErrorCodes.TOO_MANY_FILES, `Up to ${LIMITS.maxPdfImages} images per PDF.`);
    const total = inputs.reduce((n, b) => n + b.length, 0);
    if (total > LIMITS.maxPdfTotalInputBytes)
      throw new LovertError(ErrorCodes.FILE_TOO_LARGE, 'The images add up to more than 200 MB.');

    // Validate everything once, keep only small metadata (bitmaps are decoded per pass to save memory).
    const meta: { mime: string; width: number; height: number }[] = [];
    for (const [i, b] of inputs.entries()) {
      try {
        const f = validateImageBytes(b);
        checkImageIntegrity(b, f); // never embed a cut-off JPEG that a browser decoded partially
        const d = await decode(b, MIME[f]);
        d.close();
        validateDimensions(d.width, d.height);
        meta.push({ mime: MIME[f], width: d.width, height: d.height });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid image.';
        throw new LovertError(toErrorCode(e), `Image ${i + 1}: ${msg}`);
      }
    }
    const longest = Math.max(...meta.map((m) => Math.max(m.width, m.height)));

    const { best, fits } = await searchCandidate({
      lossy: true,
      allowResize: opts.allowResize,
      limitBytes: opts.limitBytes,
      minScale: Math.min(1, 300 / longest),
      isCancelled: hooks.isCancelled,
      onProgress: hooks.onProgress,
      encode: async (q, s) => {
        const pages: PdfPageImage[] = [];
        for (const [i, b] of inputs.entries()) {
          if (hooks.isCancelled?.()) throw new LovertError(ErrorCodes.CANCELLED, 'Cancelled');
          const m = meta[i]!;
          const d = await decode(b, m.mime);
          const w = Math.max(1, Math.round(m.width * s));
          const h = Math.max(1, Math.round(m.height * s));
          // White fill: JPEG has no alpha; transparent areas become white like paper.
          const jpg = await render(d.img, w, h, '#ffffff').encode('image/jpeg', q);
          d.close();
          // Layout uses the original pixel size so pages don't change when quality drops.
          pages.push({ bytes: jpg, format: 'jpeg', width: m.width, height: m.height });
        }
        return buildPdf(pages, opts.page, opts.marginPt);
      },
    });

    const pageCount = await countPages(best.bytes);
    const checks = verifyOutput({
      bytes: best.bytes, requestedFormat: 'pdf', limitBytes: opts.limitBytes, expectedPages: inputs.length, actualPages: pageCount,
    });
    const output = { bytes: best.bytes, format: 'pdf' as const, pageCount, quality: best.quality, scale: best.scale, checks };
    if (!fits && opts.limitBytes !== undefined) {
      return {
        status: 'over_limit',
        output,
        limitBytes: opts.limitBytes,
        suggestion: opts.allowResize ? PDF_OVER_LIMIT_LOWEST : PDF_OVER_LIMIT_FULL_RES,
      };
    }
    if (!checks.every((c) => c.pass)) return { status: 'error', code: ErrorCodes.ENCODE_FAILED, message: 'The PDF did not pass verification.' };
    return { status: 'ok', output };
  } catch (e) {
    return { status: 'error', code: toErrorCode(e), message: e instanceof LovertError ? e.message : 'Could not create the PDF.' };
  }
}
