import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { CompressImageTool } from '@/components/CompressImageTool';
import { RelatedGuides } from '@/components/GuideCards';
import { guidesForTool } from '@/content/guides';
import { getTool } from '@/content/tools';
import { pageMetadata } from '@/lib/seo';

const tool = getTool('compress-image');
export const metadata = pageMetadata({ path: tool.path, title: tool.title, description: tool.description });

export default function Page() {
  return (
    <>
      <section className="tool-screen">
      <header className="page-head">
      <Breadcrumbs crumbs={[{ name: 'Home', path: '/' }, { name: 'Compress image', path: tool.path }]} />
      <h1>{tool.h1}</h1>
      <p className="lede">
        Choose an image, set the maximum size, and get a JPG, PNG or WebP that is at or under it. You see the before and after, the exact byte count and
        the dimensions before downloading.
      </p>
      </header>
      <noscript>
        <p className="noscript">This tool needs JavaScript because the image is processed by your browser. Everything else on this page works without it.</p>
      </noscript>
      <CompressImageTool />
      </section>
      <RelatedGuides guides={guidesForTool('/compress-image')} />

      <div className="prose">
        <h2>How do I compress an image to a specific size, like 50 KB?</h2>
        <p>
          Turn on the size limit, enter <strong>50</strong> and choose <strong>KB</strong>, then press Compress. Lovert tries several quality
          levels and keeps the highest quality whose file is at or under 50,000 bytes. The size check uses the exact byte count of the file you
          download.
        </p>
        <h2>What goes in and what comes out?</h2>
        <table>
          <tbody>
            <tr><th scope="row">Input</th><td>One JPG, PNG or WebP image, up to 50 MB and 50 megapixels (16,384 px per side).</td></tr>
            <tr><th scope="row">Output</th><td>JPEG, WebP or PNG. WebP output depends on your browser; if it cannot create WebP, you get a clear message, not a mislabeled file.</td></tr>
            <tr><th scope="row">Units</th><td>1 KB = 1,000 bytes, 1 MB = 1,000,000 bytes. Displayed sizes are rounded up, never down.</td></tr>
            <tr><th scope="row">Dimensions</th><td>Kept as they are unless you set an exact size, or allow smaller dimensions to meet the limit.</td></tr>
            <tr><th scope="row">Transparency</th><td>JPEG cannot store transparency. You choose the fill colour (white by default). PNG and WebP keep it.</td></tr>
            <tr><th scope="row">Orientation</th><td>Photos are turned upright using their EXIF orientation.</td></tr>
          </tbody>
        </table>
        <h2>Examples</h2>
        <ul>
          <li>A job or visa form wants a photo under 50 KB: use JPEG, limit 50 KB. If even the lowest quality is too big, allow smaller dimensions.</li>
          <li>A form wants exactly 600 × 600 px and under 100 KB: choose Exact size 600 × 600, limit 100 KB. The size is never changed further.</li>
          <li>A logo with a transparent background must stay transparent: use PNG or WebP. For PNG, only smaller dimensions reduce the size.</li>
        </ul>
        <h2>What if the result is still over the limit?</h2>
        <p>
          You get the smallest file it could make with its exact size, and one concrete suggestion: switch PNG to JPEG or WebP, allow smaller
          dimensions, or raise the limit. It is never reported as a success.
        </p>
        <h2>Is my image uploaded?</h2>
        <p>
          No. The image is decoded and encoded by your browser on your device. See <Link href="/how-it-works">how it works</Link> and the{' '}
          <Link href="/privacy">privacy policy</Link>. Need several images in one file? Use <Link href="/images-to-pdf">images to PDF</Link>.
        </p>
      </div>
    </>
  );
}
