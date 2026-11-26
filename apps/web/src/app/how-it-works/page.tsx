import { Breadcrumbs } from '@/components/Breadcrumbs';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/how-it-works',
  title: 'How Lovert Processes Your Files',
  description: 'How Lovert compresses images and creates PDFs in your browser, how sizes are measured, and what is checked before you download.',
});

export default function Page() {
  return (
    <div className="prose page-head">
      <Breadcrumbs crumbs={[{ name: 'Home', path: '/' }, { name: 'How it works', path: '/how-it-works' }]} />
      <h1>How Lovert processes your files</h1>
      <p className="lede">Both tools run entirely in your browser. The page loads once; after that your files are read, processed and saved on your device.</p>
      <h2>Where does processing happen?</h2>
      <p>
        Images are decoded and re-encoded with your browser&apos;s built-in image functions, in a background worker when the browser supports
        it. PDFs are assembled with the open-source pdf-lib library and previewed with PDF.js, both loaded from this site. Files, file names and
        previews are not sent anywhere.
      </p>
      <h2>How is the size measured?</h2>
      <p>
        The check counts the bytes of the exact file you download. 1 KB is 1,000 bytes and 1 MB is 1,000,000 bytes. Sizes on screen are rounded up,
        so a file that is one byte over a limit never looks like it fits.
      </p>
      <h2>What is checked before you download?</h2>
      <ul>
        <li>Format: read from the first bytes of the output, not from what the browser claims.</li>
        <li>Size: exact byte count against your limit.</li>
        <li>Dimensions (images): the output is decoded again and its pixel size compared with what you asked for.</li>
        <li>Pages (PDF): the exported PDF is parsed and its page count compared with the number of images.</li>
      </ul>
      <p>The preview and the download use the same bytes.</p>
      <h2>Limits and why</h2>
      <p>
        Browsers hold a decoded image as 4 bytes per pixel. Images over 50 megapixels or 16,384 px per side are refused because many phones fail at
        that size. Input files are capped at 50 MB, and a PDF can hold up to 50 images.
      </p>
    </div>
  );
}
