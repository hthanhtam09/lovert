/**
 * Page copy for the image format converters: what really changes between the two formats.
 * One entry per route so every page answers its own question.
 */
import type { ReactNode } from 'react';

export interface ConversionCopy {
  lede: string;
  answer: { q: string; a: ReactNode };
  /** Rows of the "what changes" table: [aspect, input format, output format]. */
  compare: [string, string, string][];
  examples: string[];
  caveats: ReactNode[];
}

export const CONVERSION_COPY: Record<string, ConversionCopy> = {
  'png-to-jpg': {
    lede: 'Choose a PNG and get a JPG with the same pixel size. Transparent areas are filled with a colour you pick (white by default), because JPG cannot store transparency.',
    answer: {
      q: 'Why convert a PNG to JPG?',
      a: 'Photos and scans saved as PNG are often several times larger than the same image as JPG. Many upload forms also ask for JPG only. JPG drops some invisible detail to get the smaller size; at quality 85 the difference is hard to see in photos, but sharp text and line art can show soft edges.',
    },
    compare: [
      ['Compression', 'Lossless: every pixel is kept', 'Lossy: smaller, some detail is discarded'],
      ['Transparency', 'Supported', 'Not supported: filled with a colour'],
      ['Best for', 'Screenshots, logos, text', 'Photos, scans, form uploads'],
    ],
    examples: [
      'A visa form only accepts JPG: convert the PNG scan, then use Compress Image if it also has a KB limit.',
      'A logo with a transparent background becomes a JPG on white, or on the brand colour you pick.',
    ],
    caveats: ['An animated PNG (APNG) keeps only its first frame. You are told before converting.'],
  },
  'jpg-to-png': {
    lede: 'Choose a JPG and get a PNG with the same pixel size, turned upright using the photo’s EXIF orientation. PNG is lossless, so nothing more is lost from here on.',
    answer: {
      q: 'Does converting JPG to PNG improve quality?',
      a: 'No. The detail the JPG already discarded does not come back. What you gain is that further edits and re-saves as PNG lose nothing more, and forms or tools that only accept PNG will take the file. Expect the PNG to be larger than the JPG, often 2–5× for photos.',
    },
    compare: [
      ['Compression', 'Lossy', 'Lossless'],
      ['Typical size for a photo', 'Small', 'Larger (often 2–5×)'],
      ['Orientation', 'May rely on an EXIF tag', 'Pixels stored upright, no tag needed'],
    ],
    examples: [
      'An editing app or form wants PNG: convert, then check the size before uploading.',
      'A phone photo shows sideways in some apps: the PNG is stored upright, so it shows the same everywhere.',
    ],
    caveats: ['If the PNG is too large for a limit, use Compress Image: PNG can only get smaller by reducing dimensions.'],
  },
  'png-to-webp': {
    lede: 'Choose a PNG and get a WebP with the same pixel size. Transparency is kept. WebP files are usually much smaller than PNG, which makes web pages load faster.',
    answer: {
      q: 'Is WebP better than PNG?',
      a: 'For websites, usually yes: WebP keeps transparency and is often a fraction of the PNG size. Lovert writes WebP at quality 85, which is lossy, so fine pixel detail in screenshots can soften slightly. Some older desktop apps and upload forms still do not open WebP; keep the PNG for those.',
    },
    compare: [
      ['Compression', 'Lossless', 'Lossy at quality 85 (smaller)'],
      ['Transparency', 'Supported', 'Supported and kept'],
      ['Support', 'Everywhere', 'All current browsers; some older apps and forms do not'],
    ],
    examples: ['Website icons and illustrations with transparent backgrounds.', 'Large screenshots for a blog post.'],
    caveats: [
      'WebP output depends on your browser. If it cannot create WebP (it returns a PNG instead), the page says so and does not offer a mislabeled file.',
      'An animated PNG keeps only its first frame.',
    ],
  },
  'jpg-to-webp': {
    lede: 'Choose a JPG photo and get a WebP with the same pixel size, upright from its EXIF orientation. WebP is often 25–35% smaller than JPG at similar quality.',
    answer: {
      q: 'Should I convert JPG photos to WebP?',
      a: 'For your own website, WebP usually loads faster at the same visible quality. For forms, email attachments and printing, keep JPG: it is accepted everywhere. Re-encoding a JPG as WebP is lossy, so convert from the best original you have.',
    },
    compare: [
      ['Compression', 'Lossy', 'Lossy, usually smaller at similar quality'],
      ['Support', 'Everywhere', 'All current browsers; some forms and older apps do not'],
      ['Transparency', 'Not supported', 'Supported (a JPG has none to keep)'],
    ],
    examples: ['Product photos for an online shop.', 'Photo galleries on a personal site.'],
    caveats: ['WebP output depends on your browser. If it cannot create WebP, you get a clear message instead of a file.'],
  },
  'webp-to-png': {
    lede: 'Choose a WebP and get a PNG with the same pixel size. Transparency is kept. Use it when an app or upload form does not accept WebP.',
    answer: {
      q: 'Why can’t I open a WebP file?',
      a: 'Some older image editors, office apps and upload forms do not read WebP. PNG opens everywhere and is lossless, so the converted file looks exactly like the WebP you see. It is usually larger.',
    },
    compare: [
      ['Compression', 'Lossy or lossless', 'Lossless'],
      ['Transparency', 'Supported', 'Supported and kept'],
      ['Support', 'Current browsers', 'Everywhere'],
    ],
    examples: ['An image saved from a website as .webp needs to go into a document.', 'A sticker with a transparent background must stay transparent.'],
    caveats: ['An animated WebP keeps only its first frame. You are told before converting.'],
  },
  'webp-to-jpg': {
    lede: 'Choose a WebP and get a JPG with the same pixel size. Transparent areas are filled with the colour you pick, white by default.',
    answer: {
      q: 'When is JPG better than WebP?',
      a: 'When the file has to be accepted anywhere: job and visa portals, email, printing services and older apps all take JPG. JPG is lossy, so converting adds a little more compression; at quality 85 it is rarely visible in photos.',
    },
    compare: [
      ['Transparency', 'Supported', 'Not supported: filled with a colour'],
      ['Support', 'Current browsers', 'Everywhere'],
      ['Animation', 'Can be animated', 'Single image only'],
    ],
    examples: ['A form refuses a photo saved from a website as WebP.', 'A printing service only takes JPG.'],
    caveats: ['An animated WebP keeps only its first frame.', 'Need it under a KB limit too? Turn on the size limit here, or use Compress Image for exact pixel sizes.'],
  },
};
