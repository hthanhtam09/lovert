/**
 * Numbers quoted in the guides. Copied from docs/benchmarks/guides.json, which is produced by
 * tests/e2e/guides.bench.spec.ts driving the real tools. A Vitest test keeps the two in sync.
 */
export const MEASURED = {
  date: '2026-11-21',
  dateLabel: 'November 21, 2026',
  browser: 'desktop Chromium',
  guide1_photo: { inputBytes: 2430420, outputBytes: 494381, width: 4032, height: 3024, quality: 56 },
  guide1_big_noresize: { inputBytes: 9126445, outputBytes: 539600, width: 8000, height: 6000, quality: 30 },
  guide1_big_resize: { inputBytes: 9126445, outputBytes: 499885, width: 7200, height: 5400, quality: 36 },
  guide2_fullres: { inputBytes: [2376876, 2391891, 2374102], outputBytes: 936811, quality: 43, pages: 3 },
  guide2_tight_fullres: { outputBytes: 572313, quality: 30, pages: 3 },
  guide2_tight_lowerres: { outputBytes: 493975, quality: 33, resolutionPercent: 89, pages: 3 },
  guide3_original_50kb: { inputBytes: 180923, outputBytes: 49540, width: 1200, height: 600, quality: 57 },
  guide3_exact_nolimit: { outputBytes: 15747, width: 400, height: 200, quality: 85 },
  guide3_exact_50kb: { outputBytes: 30356, width: 400, height: 200, quality: 95 },
} as const;
