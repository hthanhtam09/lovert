import {
  checkImageIntegrity, detectFormat, ErrorCodes, isLossy, LovertError, MIME, searchCandidate, suggestionForOverLimit,
  toErrorCode, validateDimensions, validateImageBytes, verifyOutput,
  type ConversionResult, type ImageFormat,
} from '@lovert/core';
import { decode, hasAlpha, render } from './surface';

export interface CompressOptions {
  format: ImageFormat;
  limitBytes?: number | undefined;
  /** Fixed output size chosen by the user. When set, we never resize further. */
  size?: { width: number; height: number } | undefined;
  allowResize: boolean;
  /** Fill colour for transparent pixels when the output has no alpha (JPEG). */
  background: string;
  /** The page fixes the output format (a converter route): suggestions never propose another format. */
  formatLocked?: boolean | undefined;
}

export interface CompressInfo {
  inputFormat: ImageFormat;
  inputWidth: number;
  inputHeight: number;
  hasAlpha: boolean;
}

export type CompressResponse = { result: ConversionResult; info?: CompressInfo };

export async function compressImage(
  bytes: Uint8Array,
  opts: CompressOptions,
  hooks: { onProgress?: (step: number) => void; isCancelled?: () => boolean } = {},
): Promise<CompressResponse> {
  let info: CompressInfo | undefined;
  try {
    const inputFormat = validateImageBytes(bytes);
    checkImageIntegrity(bytes, inputFormat); // before decoding: some browsers decode cut-off JPEGs without an error
    const decoded = await decode(bytes, MIME[inputFormat]);
    try {
      validateDimensions(decoded.width, decoded.height);
      const alpha = hasAlpha(decoded.img, decoded.width, decoded.height);
      info = { inputFormat, inputWidth: decoded.width, inputHeight: decoded.height, hasAlpha: alpha };
      if (opts.size) validateDimensions(opts.size.width, opts.size.height);
      const baseW = opts.size?.width ?? decoded.width;
      const baseH = opts.size?.height ?? decoded.height;
      const background = opts.format === 'jpeg' ? opts.background : null;
      const lossy = isLossy(opts.format);
      const allowResize = opts.allowResize && !opts.size;
      let firstCheck = true;
      const dims = (s: number) => ({ width: Math.max(1, Math.round(baseW * s)), height: Math.max(1, Math.round(baseH * s)) });

      const { best, fits } = await searchCandidate({
        lossy,
        allowResize,
        limitBytes: opts.limitBytes,
        minScale: Math.min(1, 64 / Math.max(baseW, baseH)),
        isCancelled: hooks.isCancelled,
        onProgress: hooks.onProgress,
        encode: async (q, s) => {
          const d = dims(s);
          const out = await render(decoded.img, d.width, d.height, background).encode(MIME[opts.format], q);
          if (firstCheck) {
            firstCheck = false;
            // Some browsers silently return PNG when they cannot encode the requested type.
            const real = detectFormat(out);
            if (real !== opts.format)
              throw new LovertError(
                ErrorCodes.FORMAT_MISMATCH,
                `This browser cannot create ${opts.format.toUpperCase()} files (it returned ${real?.toUpperCase() ?? 'unknown'}). Choose ${opts.format === 'webp' ? 'JPEG or PNG' : 'another format'}.`,
              );
          }
          return out;
        },
      });

      const expected = dims(best.scale);
      const check = await decode(best.bytes, MIME[opts.format]);
      const actual = { width: check.width, height: check.height };
      check.close();
      const checks = verifyOutput({ bytes: best.bytes, requestedFormat: opts.format, limitBytes: opts.limitBytes, expected, actual });
      const output = { bytes: best.bytes, format: detectFormat(best.bytes) ?? opts.format, ...actual, quality: best.quality, scale: best.scale, checks };
      if (!checks.every((c) => c.pass) && fits) {
        return { result: { status: 'error', code: ErrorCodes.ENCODE_FAILED, message: 'The output did not pass verification.' }, info };
      }
      if (!fits && opts.limitBytes !== undefined) {
        return {
          result: {
            status: 'over_limit',
            output,
            limitBytes: opts.limitBytes,
            suggestion: suggestionForOverLimit({ sizeBytes: best.bytes.length, limitBytes: opts.limitBytes, lossy, allowResize, format: opts.format, fixedSize: !!opts.size, formatLocked: opts.formatLocked }),
          },
          info,
        };
      }
      return { result: { status: 'ok', output }, info };
    } finally {
      decoded.close();
    }
  } catch (e) {
    const code = toErrorCode(e);
    const message = e instanceof Error && e instanceof LovertError ? e.message : 'Something went wrong while processing the image.';
    return { result: { status: 'error', code, message }, ...(info ? { info } : {}) };
  }
}
