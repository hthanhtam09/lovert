/**
 * Tool catalog: one list drives navigation, tool pages, the home page and the sitemap.
 * Only add a tool here when its page works end to end.
 */
import type { ImageFormat } from '@lovert/core';

export type ToolCategory = 'image' | 'pdf' | 'data';

export interface ToolEntry {
  slug: string;
  path: `/${string}`;
  category: ToolCategory;
  /** <title> — unique per page. */
  title: string;
  description: string;
  h1: string;
  navLabel: string;
  summary: string;
  /** Shown in the header navigation (the footer and home list every tool). */
  featured?: boolean;
}

export const CATEGORIES: Record<ToolCategory, string> = {
  image: 'Image tools',
  pdf: 'PDF tools',
  data: 'Data tools',
};

/** The six image format converters share one pipeline (`compressImage`) and one UI; only this config differs. */
export interface ImageConversion {
  slug: string;
  from: ImageFormat;
  to: ImageFormat;
}
export const IMAGE_CONVERSIONS: readonly ImageConversion[] = [
  { slug: 'png-to-jpg', from: 'png', to: 'jpeg' },
  { slug: 'jpg-to-png', from: 'jpeg', to: 'png' },
  { slug: 'png-to-webp', from: 'png', to: 'webp' },
  { slug: 'jpg-to-webp', from: 'jpeg', to: 'webp' },
  { slug: 'webp-to-png', from: 'webp', to: 'png' },
  { slug: 'webp-to-jpg', from: 'webp', to: 'jpeg' },
];
export const FORMAT_NAME: Record<ImageFormat, string> = { jpeg: 'JPG', png: 'PNG', webp: 'WebP' };

export function getConversion(slug: string): ImageConversion {
  const c = IMAGE_CONVERSIONS.find((x) => x.slug === slug);
  if (!c) throw new Error(`Unknown conversion ${slug}`);
  return c;
}

export const TOOLS: readonly ToolEntry[] = [
  {
    slug: 'compress-image',
    path: '/compress-image',
    category: 'image',
    title: 'Compress an Image to a Target File Size (JPG, PNG, WebP)',
    description:
      'Compress a JPG, PNG or WebP image under a size limit such as 50 KB or 1 MB. Compare before and after, check the measured bytes, then download. Runs on your device.',
    h1: 'Compress an image to a target file size',
    navLabel: 'Compress image',
    summary: 'Get a JPG, PNG or WebP under a size limit, with a before/after preview.',
    featured: true,
  },
  {
    slug: 'images-to-pdf',
    path: '/images-to-pdf',
    category: 'pdf',
    title: 'Combine Images into One PDF, with an Optional Size Limit',
    description:
      'Turn JPG, PNG or WebP images into a single PDF. Reorder pages, pick A4 or Letter, set a size limit, preview the exported PDF and download. Runs on your device.',
    h1: 'Combine images into one PDF',
    navLabel: 'Images to PDF',
    summary: 'Put photos or scans into one PDF in the order you choose, under a size limit if needed.',
    featured: true,
  },
  {
    slug: 'png-to-jpg', path: '/png-to-jpg', category: 'image',
    title: 'Convert PNG to JPG, with the Fill Colour for Transparency',
    description: 'Convert a PNG to a JPG and choose the colour behind transparent areas. See before and after, the pixel size and the checked file bytes, then download.',
    h1: 'Convert PNG to JPG', navLabel: 'PNG to JPG',
    summary: 'Turn a PNG into a smaller JPG photo file. Transparent areas get a fill colour you choose.',
  },
  {
    slug: 'jpg-to-png', path: '/jpg-to-png', category: 'image',
    title: 'Convert JPG to PNG Without Further Quality Loss',
    description: 'Convert a JPG photo to a lossless PNG, upright from its EXIF orientation. Preview it, check the measured bytes and pixel size, then download.',
    h1: 'Convert JPG to PNG', navLabel: 'JPG to PNG',
    summary: 'Save a JPG as a lossless PNG for editing or for forms that ask for PNG.',
  },
  {
    slug: 'png-to-webp', path: '/png-to-webp', category: 'image',
    title: 'Convert PNG to WebP and Keep Transparency',
    description: 'Convert a PNG to a WebP that keeps its transparency and is usually much smaller. The WebP format is checked from the output bytes before you download.',
    h1: 'Convert PNG to WebP', navLabel: 'PNG to WebP',
    summary: 'Make web graphics and screenshots smaller as WebP, with transparency kept.',
  },
  {
    slug: 'jpg-to-webp', path: '/jpg-to-webp', category: 'image',
    title: 'Convert JPG to WebP for Smaller Web Images',
    description: 'Convert a JPG photo to WebP for websites and apps. Compare before and after, see the exact byte count and pixel size, then download the checked file.',
    h1: 'Convert JPG to WebP', navLabel: 'JPG to WebP',
    summary: 'Turn JPG photos into WebP for faster web pages.',
  },
  {
    slug: 'webp-to-png', path: '/webp-to-png', category: 'image',
    title: 'Convert WebP to PNG for Apps That Do Not Open WebP',
    description: 'Convert a WebP image to PNG so older apps and upload forms accept it. Transparency is kept. Preview the result and check its bytes before downloading.',
    h1: 'Convert WebP to PNG', navLabel: 'WebP to PNG',
    summary: 'Open a WebP anywhere by saving it as a PNG, transparency included.',
  },
  {
    slug: 'webp-to-jpg', path: '/webp-to-jpg', category: 'image',
    title: 'Convert WebP to JPG for Forms and Older Apps',
    description: 'Convert a WebP image to JPG for upload forms and apps that only take JPG. Choose the fill colour for transparency, check the bytes, then download.',
    h1: 'Convert WebP to JPG', navLabel: 'WebP to JPG',
    summary: 'Save a WebP as a JPG that every form and app accepts.',
  },
  {
    slug: 'csv-to-json', path: '/csv-to-json', category: 'data',
    title: 'Convert CSV to JSON with Header Keys (UTF-8)',
    description: 'Convert a UTF-8 CSV with a header row into a JSON array of objects. Quotes, commas and line breaks in fields are handled, and leading zeros are kept.',
    h1: 'Convert CSV to JSON', navLabel: 'CSV to JSON',
    summary: 'Turn a spreadsheet export into a JSON array, one object per row.',
  },
  {
    slug: 'json-to-csv', path: '/json-to-csv', category: 'data',
    title: 'Convert JSON to CSV for Excel and Google Sheets',
    description: 'Convert a JSON array of objects into a CSV with one column per key. Nested data, null values and formula-like text are handled and explained.',
    h1: 'Convert JSON to CSV', navLabel: 'JSON to CSV',
    summary: 'Open JSON data in a spreadsheet as a properly escaped CSV.',
  },
];

export const INFO_PAGES = [
  { path: '/blog', title: 'Guides: Image Size Limits and PDFs', navLabel: 'Guides' },
  { path: '/help', title: 'Help: WebP, Pixel Limits and Files Still Too Large', navLabel: 'Help' },
  { path: '/how-it-works', title: 'How Lovert Processes Your Files', navLabel: 'How it works' },
  { path: '/privacy', title: 'Privacy Policy', navLabel: 'Privacy' },
] as const;

export function getTool(slug: string): ToolEntry {
  const t = TOOLS.find((x) => x.slug === slug);
  if (!t) throw new Error(`Unknown tool ${slug}`);
  return t;
}

/** UI grouping for the tool library (broader than the live categories). */
export type LibraryGroup = 'images' | 'pdf' | 'data' | 'documents' | 'media' | 'archives';

export const LIBRARY_GROUPS: Record<LibraryGroup, { label: string; icon: string }> = {
  images: { label: 'Images', icon: '▧' },
  pdf: { label: 'PDF', icon: '▤' },
  data: { label: 'Data', icon: '▦' },
  documents: { label: 'Documents', icon: '▥' },
  media: { label: 'Video & audio', icon: '▷' },
  archives: { label: 'Archives', icon: '▣' },
};

export interface LibraryItem {
  title: string;
  description: string;
  group: LibraryGroup;
  /** Extra search words (formats, synonyms). */
  tags: string;
  /** Present only for tools that work today. Planned items are never linked or put in the sitemap. */
  path?: string;
}

export const LIBRARY: readonly LibraryItem[] = [
  { path: '/compress-image', group: 'images', title: 'Compress image', description: 'Set a size limit and preview the result.', tags: 'jpg jpeg png webp reduce size kb mb' },
  { path: '/images-to-pdf', group: 'pdf', title: 'Images to PDF', description: 'Arrange your images and export one PDF.', tags: 'jpg jpeg png webp pictures photos combine convert pages' },
  { path: '/png-to-jpg', group: 'images', title: 'PNG to JPG', description: 'Convert a PNG and choose the fill for transparency.', tags: 'png jpg jpeg convert image photo transparent' },
  { path: '/jpg-to-png', group: 'images', title: 'JPG to PNG', description: 'Save a photo as a lossless PNG.', tags: 'jpg jpeg png convert image photo lossless' },
  { path: '/png-to-webp', group: 'images', title: 'PNG to WebP', description: 'Smaller web images, transparency kept.', tags: 'png webp convert image web transparent' },
  { path: '/jpg-to-webp', group: 'images', title: 'JPG to WebP', description: 'Convert photos for faster web pages.', tags: 'jpg jpeg webp convert image photo web' },
  { path: '/webp-to-png', group: 'images', title: 'WebP to PNG', description: 'Open WebP images in any app.', tags: 'webp png convert image transparent' },
  { path: '/webp-to-jpg', group: 'images', title: 'WebP to JPG', description: 'Get a JPG every form accepts.', tags: 'webp jpg jpeg convert image photo' },
  { path: '/csv-to-json', group: 'data', title: 'CSV to JSON', description: 'Header row becomes the keys.', tags: 'csv json convert data spreadsheet excel table utf-8' },
  { path: '/json-to-csv', group: 'data', title: 'JSON to CSV', description: 'Open JSON in Excel or Sheets.', tags: 'json csv convert data spreadsheet excel table' },
  { group: 'images', title: 'Resize image', description: 'Set exact pixel dimensions.', tags: 'pixels px width height jpg jpeg png' },
  { group: 'images', title: 'HEIC to JPG', description: 'Convert photos from your phone.', tags: 'iphone image jpeg convert' },
  { group: 'pdf', title: 'Merge PDFs', description: 'Combine several PDFs into one.', tags: 'join combine append pdf' },
  { group: 'pdf', title: 'Split PDF', description: 'Extract only the pages you need.', tags: 'pages cut export pdf' },
  { group: 'pdf', title: 'Compress PDF', description: 'Shrink a PDF for sharing.', tags: 'reduce size kb mb pdf' },
  { group: 'documents', title: 'Word to PDF', description: 'Export a Word document as a PDF.', tags: 'doc docx document convert' },
  { group: 'documents', title: 'Text to Word', description: 'Turn plain text into a DOCX.', tags: 'txt document convert docx' },
  { group: 'media', title: 'Compress video', description: 'Reduce the size of a video file.', tags: 'mp4 webm video kb mb' },
  { group: 'media', title: 'MP4 to MP3', description: 'Extract audio from a video.', tags: 'audio sound convert' },
  { group: 'archives', title: 'Create ZIP', description: 'Package files into one archive.', tags: 'zip archive compress' },
  { group: 'archives', title: 'Extract ZIP', description: 'Open an archive and select files.', tags: 'unzip archive extract' },
];
