import { placeImage, type PageSizeId } from '@lovert/core';
import { PDFDocument } from 'pdf-lib';

export interface PdfPageImage {
  bytes: Uint8Array;
  format: 'jpeg' | 'png';
  /** Pixel size, used for page layout. */
  width: number;
  height: number;
}

/** One image per page, in the given order, aspect ratio kept, nothing cropped. */
export async function buildPdf(images: PdfPageImage[], page: PageSizeId, marginPt: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Neutral metadata: never write file names into the PDF.
  doc.setProducer('Lovert');
  doc.setCreator('Lovert');
  const fixed = new Date(0);
  doc.setCreationDate(fixed);
  doc.setModificationDate(fixed);
  for (const img of images) {
    const embedded = img.format === 'jpeg' ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes);
    const p = placeImage(page, img.width, img.height, marginPt);
    const pg = doc.addPage([p.pageWidth, p.pageHeight]);
    // PDF origin is bottom-left; placement is symmetric so y works unchanged.
    pg.drawImage(embedded, { x: p.x, y: p.y, width: p.width, height: p.height });
  }
  return doc.save({ useObjectStreams: true });
}

export async function countPages(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.getPageCount();
}
