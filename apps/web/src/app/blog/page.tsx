import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { GuideBrowser } from '@/components/GuideBrowser';
import { GuideCard } from '@/components/GuideCards';
import s from '@/components/blog.module.css';
import { Button } from '@/components/ui/button';
import { GUIDES } from '@/content/guides';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/blog',
  title: 'Guides: Image Size Limits and PDFs',
  description: 'Step-by-step guides for getting images and PDFs under upload limits, with real before-and-after sizes measured in Lovert.',
});

export default function BlogIndex() {
  const featured = GUIDES[0]!;
  return (
    <>
      <header className={s.hero}>
        <Breadcrumbs crumbs={[{ name: 'Home', path: '/' }, { name: 'Guides', path: '/blog' }]} />
        <p className={s.eyebrow}>Lovert guides</p>
        <h1>Guides for everyday file tasks</h1>
        <p className={s.heroLede}>
          Get images and PDFs ready to send, upload or share. Every example was run through Lovert and shows the real file sizes.
        </p>
      </header>

      <section className={s.section} aria-labelledby="featured-title">
        <h2 className={s.title} id="featured-title">
          Featured guide
        </h2>
        <GuideCard guide={featured} featured headingLevel={3} />
      </section>

      <GuideBrowser />

      <aside className={s.cta}>
        <div>
          <h2>Ready to work with your files?</h2>
          <p>Pick a tool and put a guide into practice. Files stay in your browser.</p>
        </div>
        <div className={s.actions}>
          <Button asChild size="lg">
            <Link href="/compress-image">Compress an image</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="text-foreground">
            <Link href="/images-to-pdf">Make a PDF</Link>
          </Button>
        </div>
      </aside>
    </>
  );
}
