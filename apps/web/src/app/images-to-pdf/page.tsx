import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ImagesToPdfTool } from '@/components/ImagesToPdfTool';
import { RelatedGuides } from '@/components/GuideCards';
import { guidesForTool } from '@/content/guides';
import { getTool } from '@/content/tools';
import { pageMetadata } from '@/lib/seo';

const tool = getTool('images-to-pdf');
export const metadata = pageMetadata({ path: tool.path, title: tool.title, description: tool.description });

export default function Page() {
  return (
    <>
      <section className="tool-screen">
      <header className="page-head">
      <Breadcrumbs crumbs={[{ name: 'Home', path: '/' }, { name: 'Images to PDF', path: tool.path }]} />
      <h1>{tool.h1}</h1>
      <p className="lede">
        Add JPG, PNG or WebP images, put them in order, and create one PDF with one image per page. Set a size limit if a form requires one. You see
        the pages of the exported PDF before downloading.
      </p>
      </header>
      <noscript>
        <p className="noscript">This tool needs JavaScript because the PDF is created by your browser. Everything else on this page works without it.</p>
      </noscript>
      <ImagesToPdfTool />
      </section>
      <RelatedGuides guides={guidesForTool('/images-to-pdf')} />

      <div className="prose">
        <h2>How do I combine images into one PDF under 1 MB?</h2>
        <p>
          Add your images, check the order, turn on the size limit and enter <strong>1 MB</strong>. Lovert builds the whole PDF at several JPEG
          quality levels and keeps the best one whose complete file is at or under 1,000,000 bytes. If that is not possible at full resolution, it
          tells you and lets you allow lower resolution.
        </p>
        <h2>What goes in and what comes out?</h2>
        <table>
          <tbody>
            <tr><th scope="row">Input</th><td>Up to 50 JPG, PNG or WebP images, 50 MB each, 200 MB in total.</td></tr>
            <tr><th scope="row">Output</th><td>One PDF, one image per page, in the order shown.</td></tr>
            <tr><th scope="row">Paper</th><td>A4, US Letter, or a page the size of each image. Images are scaled to fit and never cropped.</td></tr>
            <tr><th scope="row">Image encoding</th><td>Images are stored as JPEG inside the PDF. Transparent areas become white.</td></tr>
          </tbody>
        </table>
        <h2>Examples</h2>
        <ul>
          <li>Three photos of a signed form for an upload portal: add them in page order, A4, limit 1 MB.</li>
          <li>Receipts for an expense report: one PDF, small margin, no limit.</li>
          <li>A wide screenshot: it gets a landscape page so it is not shrunk to a strip.</li>
        </ul>
        <h2>How do I reorder pages without a mouse?</h2>
        <p>Each image has Move up, Move down and Remove buttons. Use Tab to reach them and Enter or Space to press them.</p>
        <h2>What if the PDF is too large?</h2>
        <p>
          Lower resolution makes the PDF smaller but small text and signatures get softer. Compare the preview at the same zoom before deciding.
          Removing images or raising the limit keeps full sharpness.
        </p>
        <p>
          Files are processed on your device. See <Link href="/how-it-works">how it works</Link>. To shrink a single image instead, use{' '}
          <Link href="/compress-image">compress image</Link>.
        </p>
      </div>
    </>
  );
}
