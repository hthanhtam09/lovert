import Link from 'next/link';
import type { Guide } from '@/content/guides';
import s from './blog.module.css';

type Level = 2 | 3 | 4;

/** Measured before → after illustration. Decorative: the same numbers are in the article text. */
export function GuideArt({ guide, cover = false }: { guide: Guide; cover?: boolean }) {
  return (
    <div className={`${s.art} ${guide.art === 'pdf' ? s.art_pdf : guide.art === 'size' ? s.art_size : ''} ${cover ? s.cover : ''}`} aria-hidden="true">
      <div className={s.flow}>
        {guide.panels.map(([label, value], i) => (
          <span key={label} style={{ display: 'contents' }}>
            {i > 0 && <span className={s.arrow}>→</span>}
            <span className={s.box}>
              <span>{label}</span>
              {value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** One guide card: measured before → after illustration, title, summary and a real HTML link. */
export function GuideCard({ guide, featured = false, headingLevel = 3 }: { guide: Guide; featured?: boolean; headingLevel?: Level }) {
  const H = (['h2', 'h3', 'h4'] as const)[headingLevel - 2]!;
  return (
    <Link href={guide.path} className={`${s.card} ${featured ? s.featured : ''}`} data-testid="guide-card">
      <GuideArt guide={guide} />
      <div className={s.copy}>
        <p className={s.meta}>
          {guide.category} · {guide.topic}
        </p>
        <H className={s.cardTitle}>{guide.title}</H>
        <p className={s.summary}>{guide.description}</p>
        <span className={s.read}>Read guide →</span>
      </div>
    </Link>
  );
}

export function GuideCards({ guides, headingLevel = 3 }: { guides: readonly Guide[]; headingLevel?: Level }) {
  return (
    <ul className={s.grid}>
      {guides.map((g) => (
        <li key={g.slug}>
          <GuideCard guide={g} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}

/** "Related guides" box for tool pages and articles. */
export function RelatedGuides({ guides, title = 'Related guides' }: { guides: readonly Guide[]; title?: string }) {
  if (!guides.length) return null;
  return (
    <section aria-labelledby="related-guides" className="my-8">
      <h2 id="related-guides" className="mb-3 text-xl font-bold tracking-tight">
        {title}
      </h2>
      <GuideCards guides={guides} />
    </section>
  );
}
