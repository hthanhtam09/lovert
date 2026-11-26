# Launch & indexing checklist

Legend: ✅ verified **locally** (static export + `scripts/serve-static.mjs`, which emulates Pages routing and `_headers`) ·
⏳ needs a real Cloudflare Preview/production URL · 🔑 needs an account.
Local checks do not prove Cloudflare behaviour.

## Build commands
| Purpose | Command | Notes |
|---|---|---|
| Preview / deploy artifact | `pnpm build:deploy` (= `pnpm build && node scripts/check-build.mjs`) | Output `apps/web/out`. Cloudflare build command. |
| Production | same, with env `DEPLOY_ENV=production`, `SITE_URL=https://<domain>` | Build fails on missing/http/localhost/reserved (`.example`/`.test`/`.invalid`) origin. |
| QA only | `pnpm build:prod-check` | Uses `https://lovert.example` with `LOVERT_QA_BUILD=1`, then moves output to `apps/web/out-prodcheck`. `check-build` fails any deploy artifact containing a reserved origin. |

## Local results (✅)
- `_headers`: `X-Robots-Tag: noindex` on `<project>.pages.dev` and `<preview>.<project>.pages.dev`; none on a custom domain (`scripts/pages-headers.test.mjs`).
- 404 status for unknown paths; `.html` and trailing slash → 308 to the clean URL (local server emulation).
- Preview build: noindex meta, no canonical, empty sitemap, robots without sitemap. QA production build: canonical/sitemap/robots/og:image absolute on one origin.
- Image worker = bundled JS chunk (`/_next/static/chunks/*.js`); PDF.js worker = `/vendor/pdf.worker.min.mjs` (200); downloads verified; no request with a body or to another origin (Playwright).

## On the first real Preview (⏳) — replace `<p>` with the preview host
```bash
H=https://<p>.<project>.pages.dev
curl -sI $H/compress-image | grep -iE '^HTTP|x-robots-tag|content-security-policy'   # 200, X-Robots-Tag: noindex
curl -sI $H/images-to-pdf  | grep -iE '^HTTP|x-robots-tag'                           # 200, noindex
curl -sI $H/does-not-exist | head -1                                                  # 404 (not 200 SPA fallback)
curl -sI $H/compress-image.html $H/compress-image/ | grep -iE '^HTTP|location'        # redirect to /compress-image
curl -s  $H/robots.txt; curl -s $H/sitemap.xml                                        # no Sitemap line; empty urlset
curl -sI $H/vendor/pdf.worker.min.mjs | grep -iE '^HTTP|content-type'                 # 200, javascript MIME
```
In a browser (desktop Chrome, Safari; and a real iPhone/Android if available — record which were used):
1. `/compress-image`: compress a photo to 50 KB, open DevTools → Network: worker chunk loads, no POST, download size ≤ limit.
2. Check WebP option: enabled on Chrome; on Safari disabled with the note (record the actual result).
3. `/images-to-pdf`: 3 images, reorder, preview renders (PDF.js worker 200), download opens with the same page order.
4. Confirm the CSP header does not block the worker or PDF.js (console has no CSP errors).

## After the domain exists
1. 🔑 Cloudflare Pages project: build `pnpm install --frozen-lockfile && pnpm build:deploy`, output `apps/web/out`, `NODE_VERSION=24`.
   Production env: `DEPLOY_ENV=production`, `SITE_URL=https://<canonical-host>`. Preview env: leave both unset.
2. ⏳ DNS + HTTPS; pick one canonical host, 301 the other host. `*.pages.dev` stays noindex via `_headers`.
3. ⏳ Live: `curl -sI https://<host>/compress-image` → 200 and **no** `X-Robots-Tag`; canonical = `https://<host>/compress-image`;
   `robots.txt` lists `https://<host>/sitemap.xml`; sitemap has 5 URLs on that host; `/nope` → 404; og:image fetches as PNG.
4. 🔑 Google Search Console (domain property, DNS TXT): submit sitemap, inspect `/`, `/compress-image`, `/images-to-pdf`.
5. 🔑 Bing Webmaster Tools: import from GSC or verify, submit sitemap.
6. ⏳ Mobile Lighthouse on live URLs (`pnpm lighthouse` covers local only); watch Core Web Vitals once field data exists.
7. IndexNow etc. only when needed and verified.
