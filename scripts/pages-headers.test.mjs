import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { headersFor, parseHeaders } from './pages-headers.mjs';

const rules = parseHeaders(readFileSync('apps/web/public/_headers', 'utf8'));

describe('_headers (local emulation of Cloudflare Pages matching)', () => {
  it('noindex on <project>.pages.dev', () => {
    expect(headersFor(rules, 'lovert.pages.dev', '/compress-image')['X-Robots-Tag']).toBe('noindex');
  });
  it('noindex on <preview>.<project>.pages.dev (hash and branch aliases)', () => {
    expect(headersFor(rules, 'a1b2c3d4.lovert.pages.dev', '/')['X-Robots-Tag']).toBe('noindex');
    expect(headersFor(rules, 'feature-webp.lovert.pages.dev', '/images-to-pdf')['X-Robots-Tag']).toBe('noindex');
  });
  it('custom production domain stays indexable', () => {
    const h = headersFor(rules, 'www.example.com', '/compress-image');
    expect(h['X-Robots-Tag']).toBeUndefined();
    expect(h['X-Content-Type-Options']).toBe('nosniff');
  });
  it('immutable caching only for hashed assets', () => {
    expect(headersFor(rules, 'www.example.com', '/_next/static/chunks/a.js')['Cache-Control']).toContain('immutable');
    expect(headersFor(rules, 'www.example.com', '/compress-image')['Cache-Control']).toBeUndefined();
  });
});
