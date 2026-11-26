/**
 * Guide bodies. Every number comes from MEASURED (see guide-measurements.ts) and every
 * control name matches the visible label in the tool.
 */
import { formatBytes, formatBytesExact } from '@lovert/core';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MEASURED as M } from './guide-measurements';
import { PDF_OVER_LIMIT_FULL_RES, PIXEL_LIMIT_TEXT } from './messages';

const b = (n: number) => `${formatBytes(n)} (${formatBytesExact(n)})`;

export interface GuideBody {
  /** Two or three sentences that answer the question directly. */
  answer: ReactNode;
  /** Remaining sections, each with its own H2. */
  body: ReactNode;
}

const tested = (
  <p className="text-sm text-muted-foreground">
    Example measured on {M.dateLabel} in {M.browser} with Lovert. The sample images were generated for these tests. Results vary a little
    between browsers because each browser has its own JPEG encoder.
  </p>
);

export const GUIDE_BODIES: Record<string, GuideBody> = {
  'compress-image-under-500-kb': {
    answer: (
      <p>
        Open <Link href="/compress-image">Compress image</Link>, choose your photo, set the limit to <strong>500 KB</strong> and press{' '}
        <strong>Compress</strong>. Lovert keeps the highest JPEG quality that still fits and shows the exact byte count before you download. In
        our test, a 12-megapixel photo fit at full size.
      </p>
    ),
    body: (
      <>
        <h2 id="steps">Steps</h2>
        <ol>
          <li>
            Open <Link href="/compress-image">Compress image</Link> and press <strong>Choose an image</strong> (or drop the file on the box).
          </li>
          <li>
            Under <strong>Size limit</strong>, keep <strong>Keep the file at or under a limit</strong> ticked, type <strong>500</strong> and choose{' '}
            <strong>KB</strong>. Lovert counts 1 KB as 1,000 bytes, so the file must be 500,000 bytes or less.
          </li>
          <li>
            Under <strong>Output format</strong>, choose <strong>JPEG</strong> for photos.
          </li>
          <li>
            Leave <strong>Dimensions</strong> on <strong>Keep original</strong> and press <strong>Compress</strong>.
          </li>
          <li>Read the checks under the preview. All three should be ticked: format, size and dimensions.</li>
          <li>Check small text (see below), then press the download button.</li>
        </ol>

        <h2 id="example-a-12-megapixel-photo">Example: a 12-megapixel photo</h2>
        <table>
          <tbody>
            <tr><th scope="row">Before</th><td>JPEG, {M.guide1_photo.width} × {M.guide1_photo.height} px, {b(M.guide1_photo.inputBytes)}</td></tr>
            <tr><th scope="row">Settings</th><td>Limit 500 KB, JPEG, Keep original</td></tr>
            <tr><th scope="row">After</th><td>JPEG, {M.guide1_photo.width} × {M.guide1_photo.height} px, {b(M.guide1_photo.outputBytes)}, quality {M.guide1_photo.quality}</td></tr>
            <tr><th scope="row">Checks</th><td>Format, size and dimensions all passed</td></tr>
          </tbody>
        </table>
        {tested}

        <h2 id="how-to-check-small-text">How to check small text</h2>
        <p>
          The sample photo has a line of small receipt text along the bottom. The previews in the tool are scaled down, so they are not a fair
          test for small text. Download the file, open it, and zoom to 100% or 200% on the part that matters: a signature, a receipt total, the
          writing on a document. Compare it with the original at the same zoom. If it is no longer readable, raise the limit if the form allows it,
          or crop the photo to the part that matters before compressing.
        </p>

        <h2 id="if-the-result-is-still-over-500-kb">If the result is still over 500 KB</h2>
        <p>
          Very large photos can stay over the limit even at the lowest quality Lovert tries. In that case you get the smallest file it could
          make, the exact size, and a suggestion. It is never reported as a success.
        </p>
        <table>
          <tbody>
            <tr><th scope="row">Before</th><td>JPEG, {M.guide1_big_noresize.width} × {M.guide1_big_noresize.height} px (48 MP), {b(M.guide1_big_noresize.inputBytes)}</td></tr>
            <tr><th scope="row">Keep original</th><td>Over the limit: {b(M.guide1_big_noresize.outputBytes)} at quality {M.guide1_big_noresize.quality}</td></tr>
            <tr><th scope="row">With &quot;Allow smaller dimensions&quot;</th><td>{M.guide1_big_resize.width} × {M.guide1_big_resize.height} px, {b(M.guide1_big_resize.outputBytes)}, quality {M.guide1_big_resize.quality}</td></tr>
          </tbody>
        </table>
        <p>
          The fix is to tick <strong>Allow smaller dimensions if needed to meet the limit</strong> and press <strong>Compress</strong> again.
          Lovert only shrinks the pixel size when you allow it. More fixes are on the <Link href="/help#output-too-large">Help page</Link>.
        </p>
      </>
    ),
  },

  'combine-photos-into-pdf-under-1-mb': {
    answer: (
      <p>
        Open <Link href="/images-to-pdf">Images to PDF</Link>, add your photos, put them in order with the arrow buttons, set the limit to{' '}
        <strong>1 MB</strong> and press <strong>Create PDF</strong>. The size is checked on the finished PDF, and you can look at every page before
        downloading. In our test, three 12-megapixel photos became a {formatBytes(M.guide2_fullres.outputBytes)} PDF.
      </p>
    ),
    body: (
      <>
        <h2 id="steps">Steps</h2>
        <ol>
          <li>
            Open <Link href="/images-to-pdf">Images to PDF</Link> and press <strong>Add images</strong>. You can select several photos at once.
          </li>
          <li>
            Check the order under <strong>Images</strong>. Each row shows its page number. Use the up and down arrow buttons to move a photo; they
            also work with the keyboard (Tab, then Enter).
          </li>
          <li>
            Under <strong>Page</strong>, pick the <strong>Paper</strong> size (A4, US Letter, or the size of each image) and a{' '}
            <strong>Margin</strong>. Photos are scaled to fit and never cropped.
          </li>
          <li>
            Tick <strong>Keep the file at or under a limit</strong>, type <strong>1</strong> and choose <strong>MB</strong>.
          </li>
          <li>
            Press <strong>Create PDF</strong>. Check the page count, the size, and the preview of each page.
          </li>
          <li>
            Press <strong>Download images.pdf</strong>. The download is the same file you just previewed.
          </li>
        </ol>

        <h2 id="example-three-photos-receipt-first">Example: three photos, receipt first</h2>
        <p>
          We added three sample photos named <em>page-1-cover.jpg</em>, <em>page-2-details.jpg</em> and <em>page-3-receipt.jpg</em>, then moved the
          receipt to the top with the up arrow twice.
        </p>
        <table>
          <tbody>
            <tr>
              <th scope="row">Photos</th>
              <td>3 × JPEG, 4032 × 3024 px, {M.guide2_fullres.inputBytes.map((n) => formatBytes(n)).join(', ')}</td>
            </tr>
            <tr><th scope="row">Order</th><td>Page 1 receipt, page 2 cover, page 3 details</td></tr>
            <tr><th scope="row">Settings</th><td>A4, Small margin, limit 1 MB</td></tr>
            <tr><th scope="row">Final PDF</th><td>{M.guide2_fullres.pages} pages, {b(M.guide2_fullres.outputBytes)}, JPEG quality {M.guide2_fullres.quality}, full resolution</td></tr>
          </tbody>
        </table>
        {tested}

        <h2 id="how-to-check-each-page">How to check each page</h2>
        <p>
          The preview under <strong>Your PDF</strong> is drawn from the exported PDF, not from your original photos. Look for three things: the
          pages are in the order you want, nothing is cut off at the edges, and the text you need (totals, dates, signatures) is still readable. For
          a closer look, open the downloaded PDF and zoom in.
        </p>

        <h2 id="if-the-pdf-is-still-too-large">If the PDF is still too large</h2>
        <p>
          With a tighter limit, Lovert tells you the PDF does not fit and shows its real size. We ran the same three photos with a 0.5 MB limit:
        </p>
        <table>
          <tbody>
            <tr><th scope="row">Full resolution</th><td>Over the limit: {b(M.guide2_tight_fullres.outputBytes)} at JPEG quality {M.guide2_tight_fullres.quality}</td></tr>
            <tr>
              <th scope="row">Lower resolution allowed</th>
              <td>{b(M.guide2_tight_lowerres.outputBytes)}, JPEG quality {M.guide2_tight_lowerres.quality}, images at {M.guide2_tight_lowerres.resolutionPercent}% resolution</td>
            </tr>
          </tbody>
        </table>
        <p>
          The message in the tool reads: &ldquo;{PDF_OVER_LIMIT_FULL_RES}&rdquo; Lower resolution makes small text softer, so check the pages again.
          If it gets too soft, remove a photo you do not need or crop photos before adding them. See the{' '}
          <Link href="/help#output-too-large">Help page</Link> for more.
        </p>
      </>
    ),
  },

  'resize-vs-compress-image': {
    answer: (
      <p>
        <strong>Resizing</strong> changes the pixel dimensions (for example 1200 × 600 px to 400 × 200 px). <strong>Compressing</strong> changes
        how many bytes the file takes (for example 181 KB to under 50 KB). They are separate limits. If a form asks for both, set both in{' '}
        <Link href="/compress-image">Compress image</Link>: an <strong>Exact size</strong> and a size limit.
      </p>
    ),
    body: (
      <>
        <h2 id="pixels-and-file-size-are-different-things">Pixels and file size are different things</h2>
        <ul>
          <li>
            <strong>Dimensions</strong> are width × height in pixels. A form that says &ldquo;400 × 200 px&rdquo; checks this. Compressing alone does
            not change it.
          </li>
          <li>
            <strong>File size</strong> is the number of bytes. A form that says &ldquo;under 50 KB&rdquo; checks this. Fewer pixels usually means fewer
            bytes, but quality matters too.
          </li>
        </ul>

        <h2 id="example-exactly-400-200-px-and-under-50-kb">Example: exactly 400 × 200 px and under 50 KB</h2>
        <p>
          We started with a {M.guide3_original_50kb.width} × {M.guide3_original_50kb.height} px JPEG of {b(M.guide3_original_50kb.inputBytes)} and
          tried three settings in Compress image (JPEG output each time).
        </p>
        <table>
          <thead>
            <tr><th scope="col">Settings</th><th scope="col">Result</th><th scope="col">Meets both rules?</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Limit 50 KB, Keep original</td>
              <td>{M.guide3_original_50kb.width} × {M.guide3_original_50kb.height} px, {b(M.guide3_original_50kb.outputBytes)}, quality {M.guide3_original_50kb.quality}</td>
              <td>No. The size fits, but the dimensions are still {M.guide3_original_50kb.width} × {M.guide3_original_50kb.height} px.</td>
            </tr>
            <tr>
              <td>Exact size 400 × 200, no limit</td>
              <td>{M.guide3_exact_nolimit.width} × {M.guide3_exact_nolimit.height} px, {b(M.guide3_exact_nolimit.outputBytes)}, quality {M.guide3_exact_nolimit.quality}</td>
              <td>Yes, but only by luck: nothing checked the size.</td>
            </tr>
            <tr>
              <td>Exact size 400 × 200 and limit 50 KB</td>
              <td>{M.guide3_exact_50kb.width} × {M.guide3_exact_50kb.height} px, {b(M.guide3_exact_50kb.outputBytes)}, quality {M.guide3_exact_50kb.quality}</td>
              <td>Yes, and both are checked before you download.</td>
            </tr>
          </tbody>
        </table>
        <p>
          The last row has higher quality than the second. With a limit set, Lovert keeps the highest quality that still fits; without a limit it
          uses a standard quality of {M.guide3_exact_nolimit.quality}.
        </p>
        {tested}

        <h2 id="steps">Steps</h2>
        <ol>
          <li>
            Open <Link href="/compress-image">Compress image</Link> and press <strong>Choose an image</strong>.
          </li>
          <li>
            Set the size limit: tick <strong>Keep the file at or under a limit</strong>, type <strong>50</strong>, choose <strong>KB</strong>.
          </li>
          <li>
            Under <strong>Dimensions</strong>, choose <strong>Exact size</strong> and fill in <strong>Width (px)</strong> 400 and{' '}
            <strong>Height (px)</strong> 200.
          </li>
          <li>
            Press <strong>Compress</strong>. The checks should say the dimensions are exactly 400×200px and the size is under the limit.
          </li>
        </ol>

        <h2 id="things-to-watch">Things to watch</h2>
        <ul>
          <li>
            <strong>Shape:</strong> with an exact width and height, the whole photo is fitted to that shape. If your photo is not already 2:1 (like
            400 × 200), it will look stretched. Crop it to the right shape first.
          </li>
          <li>
            <strong>Exact size never changes:</strong> when you set one, Lovert does not shrink it further to meet the limit. If the result is
            still too large, raise the limit or choose JPEG instead of PNG.
          </li>
          <li>
            <strong>Very large originals:</strong> images over {PIXEL_LIMIT_TEXT} are refused. See{' '}
            <Link href="/help#image-too-large">what to do</Link>.
          </li>
        </ul>
      </>
    ),
  },
};

/** In-page contents for each guide; ids match the <h2 id> above. */
export const GUIDE_TOC: Record<string, readonly { id: string; label: string }[]> = {
  'compress-image-under-500-kb': [
    { id: 'steps', label: 'Steps' },
    { id: 'example-a-12-megapixel-photo', label: 'Example: a 12-megapixel photo' },
    { id: 'how-to-check-small-text', label: 'How to check small text' },
    { id: 'if-the-result-is-still-over-500-kb', label: 'If the result is still over 500 KB' },
  ],
  'combine-photos-into-pdf-under-1-mb': [
    { id: 'steps', label: 'Steps' },
    { id: 'example-three-photos-receipt-first', label: 'Example: three photos, receipt first' },
    { id: 'how-to-check-each-page', label: 'How to check each page' },
    { id: 'if-the-pdf-is-still-too-large', label: 'If the PDF is still too large' },
  ],
  'resize-vs-compress-image': [
    { id: 'pixels-and-file-size-are-different-things', label: 'Pixels and file size are different things' },
    { id: 'example-exactly-400-200-px-and-under-50-kb', label: 'Example: exactly 400 × 200 px and under 50 KB' },
    { id: 'steps', label: 'Steps' },
    { id: 'things-to-watch', label: 'Things to watch' },
  ],
};
