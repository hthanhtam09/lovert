import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/privacy',
  title: 'Privacy Policy',
  description: 'Where Lovert processes your files, what happens when you close the tab, and what analytics are collected.',
});

// Read at build time, the same variable src/lib/analytics.ts uses, so this page always matches the build.
const ANALYTICS_ON = Boolean(process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT);

export default function Page() {
  return (
    <div className="prose page-head">
      <Breadcrumbs crumbs={[{ name: 'Home', path: '/' }, { name: 'Privacy', path: '/privacy' }]} />
      <h1>Privacy policy</h1>
      <p className="lede">Short version: your files stay on your device, nothing is stored after you close the tab, and there are no cookies.</p>

      <h2>Where are my files processed?</h2>
      <p>
        <Link href="/compress-image">Compress image</Link> and <Link href="/images-to-pdf">Images to PDF</Link> run entirely in your browser. When
        you choose a file, the page reads it into memory and processes it in a background worker on your device. File contents, file names,
        previews and file paths are never sent to Lovert or anyone else. The page only loads its own code from this site; it does not send
        requests to other servers while you use a tool.
      </p>

      <h2>What happens when I close the tab?</h2>
      <p>
        Your files, previews and results exist only in the tab&apos;s memory. When you choose another file, the old result is discarded. When you
        close or reload the tab, everything is gone. Lovert does not save anything in your browser: no cookies, no local storage, no
        database. The only copy that remains is a file you chose to download, saved by your browser in your downloads folder.
      </p>

      <h2>Analytics</h2>
      {ANALYTICS_ON ? (
        <>
          <p>This site counts how the tools are used, without any file data. Only these events are sent:</p>
          <ul>
            <li>a tool was started, a conversion completed or failed, a download button was clicked;</li>
            <li>with the tool name, an error code if there was one, and a size range such as &ldquo;100–500 KB&rdquo;.</li>
          </ul>
          <p>Never file contents, names, previews or exact sizes. No cookies are set.</p>
        </>
      ) : (
        <p>
          Analytics are turned off on this site: no usage events are collected or sent. If that changes, this page will be updated before it
          happens, and analytics would only record which tool was used, whether it worked, an error code and a size range, never the file itself.
        </p>
      )}

      <h2>Accounts and cookies</h2>
      <p>There are no accounts and Lovert does not set cookies.</p>

      <h2>Hosting</h2>
      <p>
        Like any website, the hosting provider receives standard request data (such as IP address and browser type) when pages are loaded. That
        data concerns page visits, not your files.
      </p>

      <p>
        More detail: <Link href="/how-it-works">How Lovert processes your files</Link> · <Link href="/help">Help</Link>
      </p>
    </div>
  );
}
