// Minimal static server that mimics Cloudflare Pages for a Next.js static export:
// /path → path.html, /path.html and /path/ → 308 to /path, unknown → 404.html with status 404.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { headersFor, parseHeaders } from './pages-headers.mjs';

const root = process.argv[2] ?? 'apps/web/out';
const port = Number(process.argv[3] ?? 4173);
const rules = existsSync(join(root, '_headers')) ? parseHeaders(readFileSync(join(root, '_headers'), 'utf8')) : [];
// Emulate a Pages hostname with the X-Emulate-Host request header (local check only).
const hostOf = (req) => String(req.headers['x-emulate-host'] ?? req.headers.host ?? 'localhost').split(':')[0];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function file(p) {
  const f = join(root, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  return existsSync(f) && statSync(f).isFile() ? f : null;
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let p = decodeURIComponent(url.pathname);
  for (const [k, v] of Object.entries(headersFor(rules, hostOf(req), p))) res.setHeader(k, v);
  if (p !== '/' && (p.endsWith('/') || p.endsWith('.html'))) {
    const to = p.replace(/\/+$/, '').replace(/(\/index)?\.html$/, '') || '/';
    res.writeHead(308, { Location: to + url.search }).end();
    return;
  }
  const f = p === '/' ? file('index.html') : file(p) ?? file(`${p}.html`) ?? file(join(p, 'index.html'));
  // Next's metadata image routes have no extension.
  const type = f ? (TYPES[extname(f)] ?? (p.endsWith('opengraph-image') ? 'image/png' : 'application/octet-stream')) : TYPES['.html'];
  if (!f) {
    res.writeHead(404, { 'Content-Type': type });
    createReadStream(join(root, '404.html')).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': type });
  createReadStream(f).pipe(res);
}).listen(port, () => console.log(`Serving ${root} on http://localhost:${port}`));
