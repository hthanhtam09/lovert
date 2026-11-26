import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { solidPng } from '../../../../../tests/fixtures/png';
import { buildPdf, countPages } from './build';

describe('buildPdf', () => {
  it('keeps page order, orientation and never crops', async () => {
    const imgs = [
      { bytes: solidPng(40, 20, [255, 0, 0]), format: 'png' as const, width: 40, height: 20 },
      { bytes: solidPng(20, 40, [0, 255, 0]), format: 'png' as const, width: 20, height: 40 },
      { bytes: solidPng(30, 30, [0, 0, 255]), format: 'png' as const, width: 30, height: 30 },
    ];
    const bytes = await buildPdf(imgs, 'a4', 18);
    expect(await countPages(bytes)).toBe(3);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const [p1, p2] = doc.getPages();
    expect(p1!.getWidth()).toBeGreaterThan(p1!.getHeight()); // landscape for wide image
    expect(p2!.getWidth()).toBeLessThan(p2!.getHeight());
    expect(doc.getProducer()).toBe('Lovert');
    expect(doc.getTitle()).toBeUndefined(); // no file names leak into metadata
  });

  it('is deterministic for the same input', async () => {
    const imgs = [{ bytes: solidPng(10, 10, [1, 2, 3]), format: 'png' as const, width: 10, height: 10 }];
    const a = await buildPdf(imgs, 'letter', 0);
    const b = await buildPdf(imgs, 'letter', 0);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
