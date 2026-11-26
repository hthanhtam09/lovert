import { ErrorCodes, LovertError } from './errors.ts';

export interface Candidate {
  bytes: Uint8Array;
  quality: number | undefined;
  scale: number;
}

export interface SearchOptions {
  /** Encode at a given quality (undefined for lossless) and scale (1 = original size). */
  encode: (quality: number | undefined, scale: number) => Promise<Uint8Array>;
  lossy: boolean;
  limitBytes?: number | undefined;
  /** Only shrink pixel dimensions when the user explicitly allowed it. */
  allowResize: boolean;
  /** Smallest scale we will try, e.g. so the long edge stays ≥ 64 px. */
  minScale: number;
  isCancelled?: () => boolean;
  onProgress?: (step: number) => void;
}

export const DEFAULT_QUALITY = 0.85;
export const MIN_QUALITY = 0.3;
export const MAX_QUALITY = 0.95;
const QUALITY_STEPS = 7;
const MAX_RESIZE_ROUNDS = 6;

export interface SearchResult {
  best: Candidate;
  fits: boolean;
}

/**
 * Candidate policy: highest quality that fits at full size; if nothing fits and
 * resizing is allowed, shrink and repeat. Otherwise return the smallest candidate
 * with fits=false so the caller reports "over limit" with real numbers.
 */
export async function searchCandidate(o: SearchOptions): Promise<SearchResult> {
  let step = 0;
  const run = async (q: number | undefined, s: number): Promise<Candidate> => {
    if (o.isCancelled?.()) throw new LovertError(ErrorCodes.CANCELLED, 'Cancelled');
    const bytes = await o.encode(q, s);
    o.onProgress?.(++step);
    return { bytes, quality: q, scale: s };
  };
  const fits = (c: Candidate) => o.limitBytes === undefined || c.bytes.length <= o.limitBytes;

  if (o.limitBytes === undefined) {
    return { best: await run(o.lossy ? DEFAULT_QUALITY : undefined, 1), fits: true };
  }

  let scale = 1;
  let smallest: Candidate | undefined;
  for (let round = 0; round <= MAX_RESIZE_ROUNDS; round++) {
    const found = o.lossy ? await bestQuality(run, fits, scale) : await lossless(run, fits, scale);
    if (found.fit) return { best: found.fit, fits: true };
    if (!smallest || found.smallest.bytes.length < smallest.bytes.length) smallest = found.smallest;
    if (!o.allowResize || scale <= o.minScale) break;
    // Size scales roughly with pixel count → shrink by sqrt of the ratio, with headroom.
    const ratio = o.limitBytes / found.smallest.bytes.length;
    const next = Math.max(o.minScale, scale * Math.min(0.9, Math.sqrt(ratio) * 0.95));
    if (next >= scale) break;
    scale = next;
  }
  return { best: smallest!, fits: false };
}

type Run = (q: number | undefined, s: number) => Promise<Candidate>;

async function lossless(run: Run, fits: (c: Candidate) => boolean, scale: number) {
  const c = await run(undefined, scale);
  return { fit: fits(c) ? c : undefined, smallest: c };
}

async function bestQuality(run: Run, fits: (c: Candidate) => boolean, scale: number) {
  const top = await run(MAX_QUALITY, scale);
  if (fits(top)) return { fit: top, smallest: top };
  const bottom = await run(MIN_QUALITY, scale);
  if (!fits(bottom)) return { fit: undefined, smallest: bottom };
  let lo = MIN_QUALITY;
  let hi = MAX_QUALITY;
  let best = bottom;
  for (let i = 0; i < QUALITY_STEPS; i++) {
    const mid = Math.round(((lo + hi) / 2) * 1000) / 1000;
    const c = await run(mid, scale);
    if (fits(c)) {
      best = c;
      lo = mid;
    } else hi = mid;
    if (hi - lo < 0.01) break;
  }
  return { fit: best, smallest: best };
}

/**
 * One concrete change for an over-limit result, chosen from what the user's current settings still allow.
 * Never suggests smaller dimensions when the user fixed an exact size or already allowed resizing,
 * and never suggests another format when the route fixes the output format.
 */
export function suggestionForOverLimit(args: {
  sizeBytes: number;
  limitBytes: number;
  lossy: boolean;
  allowResize: boolean;
  format: string;
  /** The user set exact pixel dimensions: they are never changed. */
  fixedSize?: boolean;
  /** The output format is fixed by the page (e.g. PNG to JPG). */
  formatLocked?: boolean;
}): string {
  const canResize = !args.allowResize && !args.fixedSize;
  if (!args.lossy) {
    if (!args.formatLocked) return 'PNG is lossless, so quality cannot be lowered. Switch the output to JPEG or WebP, or allow resizing.';
    if (canResize) return 'PNG is lossless, so quality cannot be lowered. Turn on "Allow smaller dimensions" or raise the limit.';
    return 'PNG is lossless and already at the smallest size allowed by your settings. Raise the limit, or use Compress Image to choose JPEG or WebP.';
  }
  if (args.fixedSize) return 'Even the lowest quality is too large at the exact size you set. Enter a smaller exact size or raise the limit.';
  if (canResize) return 'Even the lowest quality is too large at this size. Turn on "Allow smaller dimensions" or raise the limit.';
  const ratio = args.sizeBytes / args.limitBytes;
  return `Even at the lowest quality and smallest dimensions tried, the file is ${ratio.toFixed(1)}× the limit. Raise the limit.`;
}
