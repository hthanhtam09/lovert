import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { GuideArt, GuideCard } from '@/components/GuideCards';
import s from '@/components/blog.module.css';
import { Button } from '@/components/ui/button';
import { GUIDE_BODIES, GUIDE_TOC } from '@/content/guide-articles';
import { formatGuideDate, GUIDES } from '@/content/guides';
import { pageMetadata } from '@/lib/seo';

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) return {};
  return pageMetadata({ path: g.path, title: g.title, description: g.description });
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = GUIDES.find((x) => x.slug === slug);
  const content = GUIDE_BODIES[slug];
  if (!guide || !content) notFound();
  const others = GUIDES.filter((g) => g.slug !== guide.slug);
  const toc = [{ id: 'short-answer', label: 'Short answer' }, ...(GUIDE_TOC[slug] ?? []), { id: 'try-it', label: 'Try it' }];

  return (
    <article className={s.article}>
      <Breadcrumbs
        crumbs={[
          { name: 'Home', path: '/' },
          { name: 'Guides', path: '/blog' },
          { name: guide.title, path: guide.path },
        ]}
      />
      <header className={s.intro}>
        <p className={s.meta}>
          {guide.category} · {guide.topic}
        </p>
        <h1>{guide.title}</h1>
        <p className="lede">{guide.description}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Last tested <time dateTime={guide.updated}>{formatGuideDate(guide.updated)}</time>
        </p>
      </header>
      <GuideArt guide={guide} cover />

      <div className={s.layout}>
        <aside>
          <nav aria-label="On this page" className={s.toc}>
            <h2>On this page</h2>
            <ul>
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`}>{t.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <div className={`prose ${s.body}`}>
          <section aria-labelledby="short-answer" className={s.answerBox} data-testid="guide-answer">
            <h2 id="short-answer">Short answer</h2>
            {content.answer}
          </section>

          {content.body}

          <section aria-labelledby="try-it" className={s.cta}>
            <div>
              <h2 id="try-it">Try it with your own file</h2>
              <p>Your file is processed in your browser and is not uploaded.</p>
            </div>
            <Button asChild size="lg" className="h-11 text-base font-semibold no-underline">
              <Link href={guide.toolPath} data-testid="guide-cta">
                Open {guide.toolLabel} <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </section>
        </div>
      </div>

      <section aria-labelledby="related-guides" className={s.section}>
        <div className={s.relatedHead}>
          <h2 id="related-guides" className={s.title}>
            More guides
          </h2>
          <Link href="/blog">View all guides</Link>
        </div>
        <ul className={`${s.grid} ${s.grid2}`}>
          {others.map((g) => (
            <li key={g.slug}>
              <GuideCard guide={g} />
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
