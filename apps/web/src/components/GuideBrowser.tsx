'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GUIDES } from '@/content/guides';
import { GuideCard } from './GuideCards';
import s from './blog.module.css';

const CATEGORIES = ['All guides', ...new Set(GUIDES.map((g) => g.category))];
const TOPICS = [...new Set(GUIDES.map((g) => g.topic))];

/** Filterable guide list. Server-rendered with every guide visible, so it works without JS. */
export function GuideBrowser() {
  const [category, setCategory] = useState('All guides');
  const [topic, setTopic] = useState('');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return GUIDES.filter((g) => {
      const text = [g.title, g.description, g.category, g.topic, ...g.panels.flat()].join(' ').toLowerCase();
      return (category === 'All guides' || g.category === category) && (!topic || g.topic === topic) && terms.every((t) => text.includes(t));
    });
  }, [category, topic, query]);

  const clear = () => {
    setCategory('All guides');
    setTopic('');
    setQuery('');
  };

  return (
    <>
      <section className={s.section} id="all-guides" aria-labelledby="guide-list-title">
        <h2 className={s.title} id="guide-list-title">
          Browse all guides
        </h2>
        <div className={s.filterBar}>
          <div className={s.chips} role="group" aria-label="Filter guides by category">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={s.chip}
                aria-pressed={category === c && !topic}
                onClick={() => {
                  setCategory(c);
                  setTopic('');
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <div className={s.search}>
            <label className="sr-only" htmlFor="guide-search">
              Search guides
            </label>
            <Input id="guide-search" type="search" placeholder="Search guides…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <p className="sr-only" role="status">
          {visible.length} {visible.length === 1 ? 'guide' : 'guides'}
        </p>
        {visible.length > 0 ? (
          <ul className={s.grid}>
            {visible.map((g) => (
              <li key={g.slug}>
                <GuideCard guide={g} />
              </li>
            ))}
          </ul>
        ) : (
          <div className={s.empty}>
            <p className="mt-0">No guides found. Try another search or clear your filters.</p>
            <Button type="button" variant="outline" onClick={clear}>
              Clear filters
            </Button>
          </div>
        )}
      </section>

      <section className={s.section} aria-labelledby="topics-title">
        <h2 className={s.title} id="topics-title">
          Browse by topic
        </h2>
        <div className={s.chips} role="group" aria-label="Filter guides by topic">
          {TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              className={s.chip}
              aria-pressed={topic === t}
              onClick={() => {
                setTopic(topic === t ? '' : t);
                setCategory('All guides');
                setQuery('');
                document.getElementById('all-guides')?.scrollIntoView({ block: 'start' });
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
