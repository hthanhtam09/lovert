/**
 * Resource limits. Rationale: browsers decode images into RGBA (4 bytes/pixel).
 * 50 MP ≈ 200 MB of raw pixels, close to what mobile Safari tolerates for a
 * canvas before failing silently. Input size caps keep the original buffer,
 * the decoded bitmap and a few encoded candidates within mobile memory.
 */
export const LIMITS = {
  maxInputBytes: 50 * 1000 * 1000,
  maxPixels: 50_000_000,
  maxCanvasSide: 16_384,
  maxPdfImages: 50,
  maxPdfTotalInputBytes: 200 * 1000 * 1000,
  /** CSV/JSON: text is parsed into JS objects (several times the file size in memory). */
  maxDataInputBytes: 20 * 1000 * 1000,
  maxDataRows: 200_000,
  maxDataCells: 4_000_000,
} as const;

/**
 * Whether one more image fits in a PDF batch: count and total input bytes are both inclusive limits
 * (exactly 50 images or exactly 200,000,000 bytes is allowed; one more is not).
 */
export function pdfAdmission(current: { count: number; totalBytes: number }, sizeBytes: number): 'ok' | 'too_many' | 'too_large' {
  if (current.count >= LIMITS.maxPdfImages) return 'too_many';
  if (current.totalBytes + sizeBytes > LIMITS.maxPdfTotalInputBytes) return 'too_large';
  return 'ok';
}
