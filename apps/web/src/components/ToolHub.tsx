'use client';
import Link from 'next/link';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { LIBRARY, LIBRARY_GROUPS, type LibraryGroup, type LibraryItem } from '@/content/tools';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import s from './hub.module.css';

type Filter = 'all' | LibraryGroup;

function matches(item: LibraryItem, filter: Filter, query: string): boolean {
  if (filter !== 'all' && item.group !== filter) return false;
  const text = [item.title, item.description, item.tags, LIBRARY_GROUPS[item.group].label].join(' ').toLowerCase();
  return query.toLowerCase().trim().split(/\s+/).every((t) => text.includes(t));
}

function Card({ item }: { item: LibraryItem }) {
  const icon = (
    <span className={`${s.icon} ${s[`kind_${item.group}`]}`} aria-hidden="true">
      {LIBRARY_GROUPS[item.group].icon}
    </span>
  );
  if (item.path) {
    return (
      <Link href={item.path} className={s.card}>
        {icon}
        <span className={s.cardText}>
          <span className={s.cardTitle}>{item.title}</span>
          <span className={s.cardDesc}>{item.description}</span>
        </span>
        <Badge variant="secondary" className={s.kind}>
          {LIBRARY_GROUPS[item.group].label}
        </Badge>
      </Link>
    );
  }
  return (
    <div className={s.planned}>
      {icon}
      <span className={s.cardText}>
        <strong>{item.title}</strong>
        <span className={s.cardDesc}>{item.description}</span>
      </span>
    </div>
  );
}

/** Home hub: hero with search + filterable tool library. Fully rendered on the server; filtering is progressive. */
export function ToolHub({ guides }: { guides?: ReactNode }) {
  const searchId = useId();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const visible = useMemo(() => LIBRARY.filter((i) => matches(i, filter, query)), [filter, query]);
  const available = visible.filter((i) => i.path);
  const planned = visible.filter((i) => !i.path);
  const filters: [Filter, string][] = [['all', 'All tools'], ...Object.entries(LIBRARY_GROUPS).map(([k, v]) => [k as LibraryGroup, v.label] as [Filter, string])];

  return (
    <>
      <section className={s.hero} aria-labelledby="hub-title">
        <div className={s.heroCopy}>
          <h1 id="hub-title">
            Compress images.
            <br />
            Turn photos into PDFs.
          </h1>
          <p className={s.heroLede}>Set an exact file size limit for an image or combine photos into a single PDF. Files stay on your device.</p>
        </div>
        <div className={s.quick} role="group" aria-label="Open a tool">
          <Link href="/compress-image" className={s.quickTool}>
            <span className={s.quickFormat} aria-hidden="true">JPG</span>
            <span className={s.quickCopy}>
              <strong>Compress Image</strong>
              <span>Make an image smaller for an upload.</span>
            </span>
            <span className={s.quickArrow} aria-hidden="true">→</span>
          </Link>
          <Link href="/images-to-pdf" className={s.quickTool}>
            <span className={`${s.quickFormat} ${s.quickPdf}`} aria-hidden="true">PDF</span>
            <span className={s.quickCopy}>
              <strong>Images to PDF</strong>
              <span>Arrange photos and export one PDF.</span>
            </span>
            <span className={s.quickArrow} aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className={s.catalog} id="tool-library" aria-labelledby="library-title">
        <div className={s.catalogHead}>
          <div>
            <h2 id="library-title">Tool library</h2>
            <p className={s.count} aria-live="polite">
              {available.length} available · {planned.length} planned
            </p>
          </div>
          <form className={s.search} role="search" aria-label="Tool finder" onSubmit={(e) => e.preventDefault()}>
            <label className="sr-only" htmlFor={searchId}>
              Search tools
            </label>
            <span className={s.glyph} aria-hidden="true" />
            <Input
              id={searchId}
              className="h-9 border-0 px-0 text-base shadow-none focus-visible:ring-0"
              type="search"
              placeholder="Search tools or file types"
              autoComplete="off"
              enterKeyHint="search"
              aria-controls="tool-library"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button type="submit" size="sm" className="h-9 font-semibold">
              Search
            </Button>
          </form>
        </div>
        <div className={s.filters} role="group" aria-label="Filter tools by file type">
          {filters.map(([key, label]) => (
            <Button
              key={key}
              type="button"
              variant={filter === key ? 'default' : 'outline'}
              className="h-10 px-4 font-semibold"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        {available.length > 0 && (
          <section aria-labelledby="available-title">
            <h3 id="available-title" className={s.groupTitle}>Available tools</h3>
            <div className={s.readyGrid}>
              {available.map((i) => (
                <Card key={i.title} item={i} />
              ))}
            </div>
          </section>
        )}

        {guides}

        {planned.length > 0 && (
          <section className={s.roadmap} aria-labelledby="planned-title">
            <div className={s.groupHead}>
              <h3 id="planned-title" className={s.groupTitle}>Planned tools</h3>
              <p>Not available yet. These may be added later.</p>
            </div>
            {(Object.keys(LIBRARY_GROUPS) as LibraryGroup[]).map((g) => {
              const items = planned.filter((i) => i.group === g);
              if (!items.length) return null;
              return (
                <div key={g} className={s.categoryGroup}>
                  <h4>{LIBRARY_GROUPS[g].label}</h4>
                  <div className={s.plannedGrid}>
                    {items.map((i) => (
                      <Card key={i.title} item={i} />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {visible.length === 0 && (
          <div className={s.empty}>
            <h3>No tools found</h3>
            <p>Try a format like JPG or PDF, or clear the filters.</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFilter('all');
                setQuery('');
                document.getElementById(searchId)?.focus();
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
