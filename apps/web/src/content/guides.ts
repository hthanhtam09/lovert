import { formatBytes } from '@lovert/core';
import { MEASURED } from './guide-measurements';

/**
 * Guide catalog: one list drives the home "Guides" block, /blog, each article page,
 * related-guide links on tool pages and the sitemap.
 * Before adding a guide, check docs/seo-geo.md: no near-duplicates that only change a KB threshold.
 */
export interface Guide {
  slug: string;
  path: `/blog/${string}`;
  /** <title> and H1. */
  title: string;
  /** Meta description and the one-line summary on cards. */
  description: string;
  /** The tool the guide's call to action points to. */
  toolPath: '/compress-image' | '/images-to-pdf';
  toolLabel: string;
  /** ISO date the worked example was last measured. */
  updated: string;
  category: 'Images' | 'PDF';
  topic: string;
  /** Card illustration: before → after, using measured numbers only. */
  panels: readonly [label: string, value: string][];
  art: 'image' | 'pdf' | 'size';
}

export const GUIDES: readonly Guide[] = [
  {
    slug: 'compress-image-under-500-kb',
    path: '/blog/compress-image-under-500-kb',
    title: 'How to Compress an Image Under 500 KB',
    description: 'Get a JPG under 500 KB without guessing: set the limit, compare before and after, check small text, and fix a result that is still too large.',
    toolPath: '/compress-image',
    toolLabel: 'Compress image',
    updated: '2026-11-21',
    category: 'Images',
    topic: 'File size',
    art: 'image',
    panels: [
      ['Photo', formatBytes(MEASURED.guide1_photo.inputBytes)],
      ['Result', formatBytes(MEASURED.guide1_photo.outputBytes)],
    ],
  },
  {
    slug: 'combine-photos-into-pdf-under-1-mb',
    path: '/blog/combine-photos-into-pdf-under-1-mb',
    title: 'How to Combine Photos Into One PDF Under 1 MB',
    description: 'Put several photos into one PDF in the right order, check every page, and keep the whole file under 1 MB for an upload form.',
    toolPath: '/images-to-pdf',
    toolLabel: 'Images to PDF',
    updated: '2026-11-21',
    category: 'PDF',
    topic: 'Page order',
    art: 'pdf',
    panels: [
      ['Source', `${MEASURED.guide2_fullres.inputBytes.length} photos`],
      ['PDF', formatBytes(MEASURED.guide2_fullres.outputBytes)],
    ],
  },
  {
    slug: 'resize-vs-compress-image',
    path: '/blog/resize-vs-compress-image',
    title: 'Resize vs. Compress an Image: Which One Do You Need?',
    description: 'Pixel dimensions and file size are different limits. See what happens when a form asks for exactly 400 × 200 px and under 50 KB.',
    toolPath: '/compress-image',
    toolLabel: 'Compress image',
    updated: '2026-11-21',
    category: 'Images',
    topic: 'Image dimensions',
    art: 'size',
    panels: [
      ['Dimensions', `${MEASURED.guide3_exact_50kb.width} × ${MEASURED.guide3_exact_50kb.height} px`],
      ['Size', formatBytes(MEASURED.guide3_exact_50kb.outputBytes)],
    ],
  },
];

export function getGuide(slug: string): Guide {
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) throw new Error(`Unknown guide ${slug}`);
  return g;
}

export function guidesForTool(toolPath: Guide['toolPath']): Guide[] {
  return GUIDES.filter((g) => g.toolPath === toolPath);
}

export function formatGuideDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
