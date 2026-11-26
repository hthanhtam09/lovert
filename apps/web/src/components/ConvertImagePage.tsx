import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { CompressImageTool } from '@/components/CompressImageTool';
import { CONVERSION_COPY } from '@/content/conversions';
import { FORMAT_NAME, getConversion, getTool, IMAGE_CONVERSIONS } from '@/content/tools';

/** Server-rendered page shell for one image format converter. The tool itself is the shared image pipeline. */
export function ConvertImagePage({ slug }: { slug: string }) {
  const tool = getTool(slug);
  const conv = getConversion(slug);
  const copy = CONVERSION_COPY[slug]!;
  const from = FORMAT_NAME[conv.from];
  const to = FORMAT_NAME[conv.to];
  const related = IMAGE_CONVERSIONS.filter((c) => c.slug !== slug && (c.from === conv.from || c.to === conv.to || c.from === conv.to));
  return (
    <>
      <section className="tool-screen">
        <header className="page-head">
          <Breadcrumbs crumbs={[{ name: 'Home', path: '/' }, { name: tool.navLabel, path: tool.path }]} />
          <h1>{tool.h1}</h1>
          <p className="lede">{copy.lede}</p>
        </header>
        <noscript>
          <p className="noscript">This converter needs JavaScript because the image is converted by your browser. Everything else on this page works without it.</p>
        </noscript>
        <CompressImageTool conversion={conv} />
      </section>
      <div className="prose">
        <h2>{copy.answer.q}</h2>
        <p>{copy.answer.a}</p>
        <h2>What changes from {from} to {to}?</h2>
        <table>
          <thead>
            <tr><th scope="col"></th><th scope="col">{from}</th><th scope="col">{to}</th></tr>
          </thead>
          <tbody>
            {copy.compare.map(([k, a, b]) => (
              <tr key={k}><th scope="row">{k}</th><td>{a}</td><td>{b}</td></tr>
            ))}
          </tbody>
        </table>
        <h2>What goes in and what comes out?</h2>
        <table>
          <tbody>
            <tr><th scope="row">Input</th><td>One {from} image, up to 50 MB and 50 megapixels (16,384 px per side). The format is checked from the file contents, not the name.</td></tr>
            <tr><th scope="row">Output</th><td>{to}, checked from the output bytes before you can download it. Preview and download are the same file.</td></tr>
            <tr><th scope="row">Pixel size</th><td>Same as the image you see. Photos are turned upright using their EXIF orientation.</td></tr>
            <tr><th scope="row">Size limit</th><td>Optional. Turn it on to keep the file at or under a KB/MB limit (1 KB = 1,000 bytes). For exact pixel dimensions use <Link href="/compress-image">Compress Image</Link>.</td></tr>
          </tbody>
        </table>
        <h2>Examples</h2>
        <ul>{copy.examples.map((e) => <li key={e}>{e}</li>)}</ul>
        <h2>Limits and errors</h2>
        <ul>
          {copy.caveats.map((c, k) => <li key={k}>{c}</li>)}
          <li>A file that is not really a {from} (for example a renamed {from === 'PNG' ? 'JPG' : 'PNG'}), an empty file or a cut-off file is refused with a reason.</li>
        </ul>
        <h2>Is my image uploaded?</h2>
        <p>
          No. The image is decoded and encoded by your browser on your device. See <Link href="/how-it-works">how it works</Link>.
        </p>
        <h2>Other converters</h2>
        <ul>
          {related.map((c) => (
            <li key={c.slug}><Link href={`/${c.slug}`}>{FORMAT_NAME[c.from]} to {FORMAT_NAME[c.to]}</Link></li>
          ))}
          <li><Link href="/images-to-pdf">Images to PDF</Link></li>
        </ul>
      </div>
    </>
  );
}
