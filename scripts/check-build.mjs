// Post-build SEO/integrity check over the static export.
// Detects: missing/duplicate title, description, H1, canonical; dead internal links;
// sitemap entries that are noindex or missing; production pages missing from the sitemap.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const OUT = process.argv[2] ?? 'apps/web/out';
const errors = [];
const warn = [];

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const routeOf = (f) => {
  const r = '/' + relative(OUT, f).replace(/\\/g, '/').replace(/\.html$/, '');
  return r === '/index' ? '/' : r;
};
const attr = (html, re) => html.match(re)?.[1];
const exists = (path) => {
  const p = path.split(/[?#]/)[0];
  if (p === '/') return true;
  return [p, `${p}.html`, join(p, 'index.html')].some((c) => existsSync(join(OUT, c)) && statSync(join(OUT, c)).isFile());
};

const htmlFiles = walk(OUT).filter((f) => f.endsWith('.html') && !/\/(404|_not-found)\.html$/.test(f));
const pages = htmlFiles.map((f) => {
  const html = readFileSync(f, 'utf8');
  return {
    route: routeOf(f),
    html,
    title: attr(html, /<title>([^<]*)<\/title>/),
    description: attr(html, /<meta name="description" content="([^"]*)"/),
    canonical: attr(html, /<link rel="canonical" href="([^"]*)"/),
    robots: attr(html, /<meta name="robots" content="([^"]*)"/) ?? '',
    h1: (html.match(/<h1[\s>]/g) ?? []).length,
    links: [...html.matchAll(/<a [^>]*href="(\/[^"]*)"/g)].map((m) => m[1]),
  };
});

const sitemapXml = existsSync(join(OUT, 'sitemap.xml')) ? readFileSync(join(OUT, 'sitemap.xml'), 'utf8') : '';
const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const robotsTxt = readFileSync(join(OUT, 'robots.txt'), 'utf8');
const production = sitemapUrls.length > 0;
const origin = production ? new URL(sitemapUrls[0]).origin : null;

const seen = { title: new Map(), canonical: new Map() };
for (const p of pages) {
  const noindex = /noindex/.test(p.robots);
  if (!p.title) errors.push(`${p.route}: missing <title>`);
  if (!p.description) errors.push(`${p.route}: missing meta description`);
  if (p.h1 !== 1) errors.push(`${p.route}: expected exactly one <h1>, found ${p.h1}`);
  for (const k of ['title', 'canonical']) {
    if (!p[k]) continue;
    if (seen[k].has(p[k])) errors.push(`${p.route}: duplicate ${k} with ${seen[k].get(p[k])}`);
    seen[k].set(p[k], p.route);
  }
  for (const l of p.links) if (!exists(l)) errors.push(`${p.route}: dead internal link ${l}`);
  if (production) {
    const expected = p.route === '/' ? origin : `${origin}${p.route}`;
    if (noindex) errors.push(`${p.route}: production page is noindex`);
    if (p.canonical !== expected) errors.push(`${p.route}: canonical ${p.canonical} ≠ ${expected}`);
    if (!sitemapUrls.includes(expected)) errors.push(`${p.route}: indexable page missing from sitemap`);
    if (!/<meta property="og:image" content="https:\/\//.test(p.html)) errors.push(`${p.route}: missing absolute og:image`);
  } else {
    if (p.canonical) errors.push(`${p.route}: non-production build must not emit canonical (${p.canonical})`);
    if (!noindex) errors.push(`${p.route}: non-production build must be noindex`);
  }
}
for (const u of sitemapUrls) {
  const path = new URL(u).pathname;
  const page = pages.find((p) => p.route === (path === '/' ? '/' : path));
  if (!page) errors.push(`sitemap: ${u} has no page`);
  else if (/noindex/.test(page.robots)) errors.push(`sitemap: ${u} is noindex`);
  if (new URL(u).search) errors.push(`sitemap: ${u} has a query string`);
}
if (production && !robotsTxt.includes(`Sitemap: ${origin}/sitemap.xml`)) errors.push('robots.txt does not point to the sitemap');
if (!production && /Sitemap:/i.test(robotsTxt)) errors.push('non-production robots.txt must not list a sitemap');
if (!existsSync(join(OUT, '404.html'))) errors.push('404.html missing');
if (!existsSync(join(OUT, 'vendor/pdf.worker.min.mjs'))) errors.push('PDF.js worker missing from export');
// The reserved QA origin must never reach a deployable artifact.
if (process.env.LOVERT_QA_BUILD !== '1') {
  const hits = walk(OUT).filter((f) => /\.(html|txt|xml|js|json)$/.test(f) && /https:\/\/[a-z0-9.-]+\.(example|test|invalid)\b/.test(readFileSync(f, 'utf8')));
  if (hits.length) errors.push(`reserved test origin found in deploy artifact: ${hits.slice(0, 5).map((f) => relative(OUT, f)).join(', ')}`);
}
const leaked = walk(OUT).filter((f) => f.endsWith('.ts'));
if (leaked.length) warn.push(`TypeScript source copied into export (unused by runtime): ${leaked.map((f) => relative(OUT, f)).join(', ')}`);

console.log(`Checked ${pages.length} pages (${production ? `production, origin ${origin}` : 'non-production'}), sitemap ${sitemapUrls.length} URLs.`);
for (const w of warn) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
if (errors.length) process.exit(1);
console.log('OK');
