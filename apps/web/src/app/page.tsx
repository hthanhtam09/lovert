import Link from 'next/link';
import { JsonLd } from '@/components/JsonLd';
import { GuideCards } from '@/components/GuideCards';
import { ToolHub } from '@/components/ToolHub';
import { GUIDES } from '@/content/guides';
import { pageMetadata, websiteJsonLd } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/',
  title: 'Lovert: Compress Images and Make PDFs Under a Size Limit',
  description: 'Free tools that make files fit a size limit and show you the result before you download. Compress JPG, PNG or WebP images and combine images into a PDF, on your device.',
  absoluteTitle: true,
});

export default function Home() {
  return (
    <>
      <JsonLd data={websiteJsonLd()} />
      <ToolHub
        guides={
          <section aria-labelledby="home-guides" className="mt-9">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="home-guides" className="m-0 text-[19px] font-bold tracking-tight">
                Guides
              </h3>
              <Link href="/blog" className="text-sm font-semibold text-primary">
                View all guides
              </Link>
            </div>
            <GuideCards guides={GUIDES.slice(0, 3)} headingLevel={4} />
          </section>
        }
      />
      <section className="prose">
        <h2>How is this different from other converters?</h2>
        <p>
          Upload forms often reject files over a limit like 50 KB or 1 MB. Every Lovert result shows the measured size in bytes, the real format
          read from the file, and the pixel dimensions. If a file still does not fit, Lovert says so and suggests one specific change instead of
          reporting success. Read <Link href="/how-it-works">how Lovert processes files</Link>.
        </p>
      </section>
    </>
  );
}
