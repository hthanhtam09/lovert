# SEO, GEO and competition plan

## Positioning
v1 promise: **the output fits the limit, and you see the actual result (bytes, format, pixels, pages) before you download.**
No exclusivity claims. Competitors may do parts of this; we compete on verified output and clarity.

## Page pattern (for search and AI answers)
1. H1 = the task. 2. Short plain answer in the lede. 3. The tool immediately. 4. Q&A sections that answer real questions
("How do I compress an image to 50 KB?") with steps, an input/output table, examples, limits and what happens on failure.
5. How it is measured (`/how-it-works`). Tested numbers go in `docs/benchmarks.md` with date and environment before they go on a page.

## Query groups to research (no volumes recorded — none sourced yet)
| Group | Example queries | Current page | Notes before adding a URL |
|---|---|---|---|
| Target size | compress image to target size, compress jpg to 50kb, reduce photo to 100 kb | `/compress-image` (`?max=` prefill only) | Check SERP: do size-specific pages (e.g. "to 20 KB") rank with distinct content? Only then a separate URL. |
| Images → PDF under limit | combine images into PDF under 1 MB, jpg to pdf under 500kb | `/images-to-pdf` | Same page; limit is an option. |
| Exact dimensions | resize image to exact dimensions, resize to 600x600 | covered partly by Exact size | Candidate new tool `/resize-image` if intent is resize without size limit. |
| PDF compression | compress pdf | none | Separate feature (existing PDFs). Do not promote on `/images-to-pdf`. |

### Candidate pages (fill before building; see `add-tool` skill)
| URL | Real benefit | Closest competitor | Measurement | Why a separate URL |
|---|---|---|---|---|
| `/resize-image` | exact px + optional size limit, verified | not checked | e2e + benchmark | distinct intent (dimensions, not bytes) — to confirm with SERP review |

### Built: format converters and data converters (2026-11)

| Route | User task | Why its own URL (vs. /compress-image) | Success measure |
|---|---|---|---|
| /png-to-jpg, /webp-to-jpg | Get a JPG a form/app accepts; choose the fill for transparency | Intent is the format, not the size; page explains transparency loss | Output bytes are JPEG, same pixel size, preview == download |
| /jpg-to-png, /webp-to-png | Get a lossless PNG / open a WebP anywhere | Explains "no quality gain" and the larger size | Output bytes are PNG, alpha kept |
| /png-to-webp, /jpg-to-webp | Smaller web images | Explains WebP support and lossy quality 85 | Output bytes are WebP; clear message if the browser cannot encode WebP |
| /csv-to-json, /json-to-csv | Move tabular data between spreadsheet and code | No existing page; different input/output and errors | Output parsed back and compared cell by cell |

The six image routes share one pipeline and UI (`CompressImageTool` with `conversion`); the optional size limit uses the same verifier.
KB-specific landing pages (e.g. "png to jpg under 100 kb") are deliberately not created yet. No search volumes recorded (none sourced).

## Crawler policy
- Google: standard Googlebot rules apply to AI features (AI Overviews); no special file. `Google-Extended` only controls Gemini training/grounding use, not Search.
- OpenAI: `OAI-SearchBot` = ChatGPT search results; `GPTBot` = model training; `ChatGPT-User` = user-triggered fetches.
  **Decision v1:** allow all (robots `User-Agent: * Allow: /`). Being cited in search answers needs OAI-SearchBot; GPTBot is
  allowed because the content is public how-to text. Revisit if policy changes; blocking GPTBot does not remove ChatGPT search visibility.
- Bing: Bingbot powers Copilot answers; Bing Webmaster AI performance reports after verification.
- `llms.txt`: not a launch criterion and not required by Google AI features.

## Measuring
- Discovery: GSC + Bing impressions/clicks per page and query group.
- Task completion (only if opt-in analytics is enabled): `tool_started` → `conversion_completed` (status ok) → `download_clicked`,
  plus `conversion_failed` by code and size bucket. Fix the largest drop first.
- A download is not proof the target portal accepted the file.

## Competition plan (ordered)
1. Publish reproducible internal benchmark (fixtures in repo, method in `docs/benchmarks.md`).
2. Run the same fixtures through 2–3 competitors we can legally use; record separately; "not measured" until done.
3. Fix the biggest gap shown by data (likely: WebP on Safari, very small limits, signature legibility in PDFs).
4. Share the benchmark/demo where people ask the question (relevant forums, Q&A threads) — one helpful post per context, no link drops or mass backlinks.

## Guides (/blog)
Catalog: `apps/web/src/content/guides.ts` (home block, /blog, articles, related guides on tools, sitemap).
Numbers in articles come from `docs/benchmarks/guides.json` (`BENCH=1 pnpm test:e2e tests/e2e/guides.bench.spec.ts`), checked by `guide-measurements.test.ts`.
Next topics: "Why Is My Compressed Image Still Too Large?", "JPG, PNG, or WebP?". Changelog page later.
Do not add near-duplicates that only change the KB threshold (under 100 KB, under 200 KB...): link to the tool with `?max=` instead.
