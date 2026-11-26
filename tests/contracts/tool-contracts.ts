/**
 * Test contracts: what every public tool promises and which cases must run and pass before it may ship.
 * `scripts/tool-gate.mjs` checks this file against the tool catalogue (apps/web/src/content/tools.ts),
 * the route folders in apps/web/src/app and the real Vitest/Playwright results. A case counts only when a test
 * whose title carries its tag `[slug:case]` actually ran; declaring it here is not enough.
 *
 * Erasable TypeScript only (Node runs this file directly in the gate).
 */
import { REQUIRED_PROJECTS } from './projects.ts';

/** Browser abilities a case may lack. UNSUPPORTED is valid only when the test detected the gap at runtime and verified the UI handles it. */
export type Capability = 'webp-encode';

export interface CaseSpec {
  id: string;
  /** unit: Vitest (any runtime-neutral logic). e2e: Playwright through the real UI on every required project. */
  layer: 'unit' | 'e2e';
  /** merge: required on every pull request. release: large files / repeated races, required before a release. */
  stage: 'merge' | 'release';
  what: string;
  /** Capabilities whose absence may turn this case into a verified UNSUPPORTED. */
  unsupported?: Capability[];
}

export interface ToolContract {
  slug: string;
  /** public: has a route and catalogue entry, gated. planned: roadmap only, no route; never gated, never linked. */
  status: 'public' | 'planned';
  inputs: string[];
  outputs: string[];
  limits: { name: string; value: number; unit: 'bytes' | 'pixels' | 'px per side' | 'files' | 'rows' | 'cells' }[];
  capabilities: Capability[];
  cases: CaseSpec[];
}

export const PROJECTS = REQUIRED_PROJECTS;

const e2e = (id: string, what: string, unsupported?: Capability[]): CaseSpec => ({ id, layer: 'e2e', stage: 'merge', what, ...(unsupported ? { unsupported } : {}) });
const unit = (id: string, what: string): CaseSpec => ({ id, layer: 'unit', stage: 'merge', what });
const release = (id: string, what: string): CaseSpec => ({ id, layer: 'e2e', stage: 'release', what });

/** The matrix every tool shares (section 2 of the QA policy). `u` lists capabilities that may make output cases UNSUPPORTED. */
function common(o: { setting: boolean; u?: Capability[] }): CaseSpec[] {
  return [
    e2e('flow', 'Open from the catalogue, pick a valid fixture, run, download via the UI; check the downloaded bytes', o.u),
    e2e('empty', '0-byte file is refused with a message; no download'),
    e2e('mismatch', 'Content does not match the name/MIME (or the route input) → refused by policy; no download'),
    e2e('corrupt', 'Damaged or truncated file → refused with a message; no download'),
    e2e('misnamed', 'Valid content under a wrong extension/MIME is handled by the content-first policy', o.u),
    e2e('stale-file', 'Switch A→B while A runs (switch triggered by the job-sent mark): A never shows, B wins', o.u),
    e2e('stale-read', 'Switch A→B while A is still being read (read held by the test): B wins', o.u),
    ...(o.setting ? [e2e('stale-setting', 'Change an output setting after a result and during a job: result cleared, late result dropped', o.u)] : []),
    e2e('retry', 'After an error, a valid file works without reloading', o.u),
    e2e('route-change', 'Leave the route mid-job via the header and come back: no stale result; it works again', o.u),
    e2e('consistency', 'Preview comes from the same output as the download (SHA-256), name/ext, byte count, MIME', o.u),
    e2e('privacy', 'No request carries file bytes, names or content (URL, body, other origin) during pick, run, preview, download and error', o.u),
    e2e('a11y', 'Header visible; main CTA in the viewport; keyboard reaches the input and action; status/alert announced', o.u),
    e2e('static', 'Direct open on the static export: title/description/H1 from the catalogue, non-production noindex, worker/assets load', o.u),
  ];
}

const IMAGE_LIMITS = [
  { name: 'input file', value: 50_000_000, unit: 'bytes' as const },
  { name: 'decoded image', value: 50_000_000, unit: 'pixels' as const },
  { name: 'side', value: 16_384, unit: 'px per side' as const },
];

const NAME = { jpeg: 'JPG', png: 'PNG', webp: 'WebP' } as const;
type Img = keyof typeof NAME;

function converter(slug: string, from: Img, to: Img): ToolContract {
  const u: Capability[] | undefined = to === 'webp' ? ['webp-encode'] : undefined;
  return {
    slug,
    status: 'public',
    inputs: [NAME[from]],
    outputs: [NAME[to]],
    limits: IMAGE_LIMITS,
    capabilities: u ?? [],
    cases: [
      ...common({ setting: true, u }),
      e2e('pair', `${NAME[from]}→${NAME[to]}: magic bytes, .${to === 'jpeg' ? 'jpg' : to} download name, pixel size, representative pixels of the decoded file`, u),
      ...(from !== 'jpeg'
        ? [e2e('alpha', to === 'jpeg' ? 'Transparent areas get the chosen fill colour' : 'Transparent areas stay transparent, opaque areas stay opaque', u)]
        : [e2e('exif', 'EXIF orientation 3/6/8 applied exactly once (asymmetric fixture, colour positions)', u)]),
      ...(from !== 'jpeg' ? [e2e('animated', 'Animated input: warning before converting; output is the first frame', u)] : []),
      e2e('pixel-limit', 'Image over 50 MP / 16,384 px refused from its header before decoding'),
      e2e('limit-over', 'Optional size limit: over-limit result shows exact size and bytes over matching the download; Adjust settings is primary', u),
      ...(to === 'webp' ? [e2e('format-mismatch', 'Browser returns PNG when asked for WebP: UI says WebP is unsupported, nothing downloads as .webp')] : []),
    ],
  };
}

export const CONTRACTS: readonly ToolContract[] = [
  {
    slug: 'compress-image',
    status: 'public',
    inputs: ['JPG', 'PNG', 'WebP'],
    outputs: ['JPG', 'PNG', 'WebP'],
    limits: [...IMAGE_LIMITS, { name: 'output limit (user)', value: 1, unit: 'bytes' }],
    capabilities: ['webp-encode'],
    cases: [
      ...common({ setting: true }),
      e2e('jpeg-in', 'JPEG input compresses to a verified JPEG'),
      e2e('png-alpha-in', 'PNG with alpha to PNG keeps transparency'),
      e2e('webp-in', 'WebP input is decoded and compressed'),
      e2e('exif-3', 'EXIF 3 (180°) applied once'),
      e2e('exif-6', 'EXIF 6 (90° CW) applied once'),
      e2e('exif-8', 'EXIF 8 (90° CCW) applied once'),
      unit('limit-bytes', '100 KB limit: 99,999 and 100,000 bytes pass, 100,001 fails'),
      e2e('limit-pass', 'Real fixture under the limit passes; downloaded byte count ≤ limit'),
      e2e('limit-over', 'Over the limit: size and bytes over match the download; Adjust settings is the primary CTA'),
      e2e('keep-size', 'Exact pixel size is never changed'),
      e2e('resize-only-allowed', 'Dimensions shrink only after the user allows it'),
      e2e('alpha-bg', 'PNG alpha to JPEG uses the chosen fill colour'),
      e2e('webp-out', 'WebP output: verified WebP bytes or a verified "unavailable" UI', ['webp-encode']),
      e2e('format-mismatch', 'Browser returns PNG for WebP: option disabled with a note, no .webp download'),
      e2e('invalidate', 'Changing format, size or limit clears the old result immediately'),
      unit('input-bytes', 'Input bytes 49,999,999 / 50,000,000 accepted, 50,000,001 refused'),
      unit('pixel-limit-boundary', 'Pixels at/under/over 50 MP and 16,384 px per side'),
      e2e('pixel-limit', 'Image over 50 MP refused from its header before decoding'),
      release('input-bytes-over', 'Real 50,000,001-byte file refused in the UI'),
    ],
  },
  {
    slug: 'images-to-pdf',
    status: 'public',
    inputs: ['JPG', 'PNG', 'WebP'],
    outputs: ['PDF'],
    limits: [...IMAGE_LIMITS, { name: 'images', value: 50, unit: 'files' }, { name: 'total input', value: 200_000_000, unit: 'bytes' }],
    capabilities: [],
    cases: [
      ...common({ setting: true }),
      e2e('single', 'One image → one page'),
      e2e('mixed', 'JPEG + PNG + WebP in one PDF, in order'),
      e2e('count-limit', '50 images accepted, the 51st refused'),
      unit('count-limit-boundary', '49 / 50 accepted, 51 refused (pdfAdmission)'),
      unit('total-limit', '199,999,999 / 200,000,000 bytes accepted, 200,000,001 refused (pdfAdmission)'),
      release('total-limit-over', 'Real files over 200 MB in total: the last one refused in the UI'),
      e2e('corrupt-between', 'A damaged file between good ones is skipped; the good ones stay in order'),
      e2e('duplicate-names', 'Two files with the same name are both kept and distinguishable'),
      e2e('two-batches', 'Two add batches keep their order'),
      e2e('keyboard-reorder', 'Reorder by keyboard; focus stays on a usable control; order read from the downloaded PDF'),
      e2e('remove-focus', 'Remove an image; focus moves to the neighbour or the picker'),
      e2e('page-a4', 'A4 pages measured from the downloaded PDF'),
      e2e('page-letter', 'Letter pages measured from the downloaded PDF'),
      e2e('page-fit', 'Fit pages match each image'),
      e2e('exif', 'EXIF-rotated photo upright in the PDF'),
      e2e('limit-pass', 'Size limit met, measured on the serialized PDF bytes'),
      e2e('limit-over', 'Over the limit after serialization: numbers shown, Adjust settings primary'),
      e2e('pixel-limit', 'Image over 50 MP refused before decoding'),
    ],
  },
  converter('png-to-jpg', 'png', 'jpeg'),
  converter('jpg-to-png', 'jpeg', 'png'),
  converter('png-to-webp', 'png', 'webp'),
  converter('jpg-to-webp', 'jpeg', 'webp'),
  converter('webp-to-png', 'webp', 'png'),
  converter('webp-to-jpg', 'webp', 'jpeg'),
  {
    slug: 'csv-to-json',
    status: 'public',
    inputs: ['CSV (UTF-8, comma, header row)'],
    outputs: ['JSON array of objects, string values'],
    limits: [
      { name: 'input file', value: 20_000_000, unit: 'bytes' },
      { name: 'data rows', value: 200_000, unit: 'rows' },
      { name: 'cells', value: 4_000_000, unit: 'cells' },
    ],
    capabilities: [],
    cases: [
      ...common({ setting: false }),
      unit('bom', 'UTF-8 BOM removed'),
      unit('no-bom', 'UTF-8 without BOM'),
      unit('vietnamese', 'Vietnamese text kept exactly'),
      unit('lf', 'LF line ends'),
      unit('crlf', 'CRLF line ends'),
      unit('quoted-comma', 'Comma inside a quoted field'),
      unit('escaped-quote', '"" inside a quoted field'),
      unit('newline-in-cell', 'Line break inside a quoted field'),
      unit('empty-last-column', 'Empty last column kept as ""'),
      unit('final-newline', 'Last line with and without a newline'),
      unit('strings-kept', '00123, false, 1e3 and empty cells stay strings'),
      unit('proto-key', '__proto__ is a normal data key'),
      unit('header-empty', 'Empty header reported with its column'),
      unit('header-duplicate', 'Duplicate header reported with its columns'),
      unit('row-short', 'Row with too few values reported with its line'),
      unit('row-long', 'Row with too many values reported with its line'),
      unit('unclosed-quote', 'Unclosed quote reported with its line'),
      unit('blank-lines', 'Policy: empty lines are skipped and counted in the notes'),
      unit('invalid-utf8', 'Policy: non-UTF-8 input refused (INVALID_ENCODING)'),
      unit('limits', 'Rows 200,000 ok / 200,001 refused; bytes 20,000,000 ok / 20,000,001 refused; cells over 4,000,000 refused'),
      e2e('full-compare', 'Downloaded JSON parsed and compared with every expected value'),
      e2e('errors-ui', 'Header/row errors shown as alerts with positions; no download'),
      e2e('preview-truncated', 'Preview cut to 50 rows, download has every row'),
      release('input-bytes-over', 'Real 20,000,001-byte file refused in the UI'),
    ],
  },
  {
    slug: 'json-to-csv',
    status: 'public',
    inputs: ['JSON array of objects (UTF-8)'],
    outputs: ['CSV (RFC 4180, CRLF, optional UTF-8 BOM)'],
    limits: [
      { name: 'input file', value: 20_000_000, unit: 'bytes' },
      { name: 'items', value: 200_000, unit: 'rows' },
      { name: 'cells', value: 4_000_000, unit: 'cells' },
    ],
    capabilities: [],
    cases: [
      ...common({ setting: true }),
      unit('later-keys', 'Keys that first appear in later rows become later columns'),
      unit('missing-key', 'Missing key → empty cell'),
      unit('null', 'null → empty cell (documented)'),
      unit('boolean', 'true/false written as text'),
      unit('number', 'Numbers written as in JSON'),
      unit('nested', 'Objects/arrays written as JSON text'),
      unit('escape', 'Comma, quote and newline escaped per RFC 4180'),
      unit('broken-json', 'Broken JSON refused'),
      unit('root-type', 'Root that is not an array refused'),
      unit('item-type', 'Item that is not an object refused with its position'),
      unit('empty-array', 'Policy: empty array refused'),
      unit('limits', 'Items 200,000 ok / 200,001 refused; cells over 4,000,000 refused'),
      unit('formula-raw', 'Default: = + - @ text kept exactly, counted in the notes'),
      unit('formula-protected', 'Protection on: apostrophe added to text only, numbers unchanged'),
      unit('round-trip', 'String-only data with one schema: CSV → JSON → CSV is identical'),
      unit('non-round-trip', 'Documented losses: numbers/booleans become strings, null and missing both become ""'),
      unit('bom', 'BOM only when asked'),
      e2e('exact-expected', 'Downloaded CSV equals the exact expected text (independent of the app parser)'),
      e2e('formula-modes', 'Both formula modes through the UI; protection never changes numbers'),
      e2e('errors-ui', 'Broken JSON, wrong root and wrong items shown as alerts; no download'),
      e2e('preview-truncated', 'Preview cut to 50 rows, download has every row'),
      release('input-bytes-over', 'Real 20,000,001-byte file refused in the UI'),
    ],
  },
  // Roadmap items from the tool library: no route, never linked, not gated until they ship.
  ...['resize-image', 'heic-to-jpg', 'merge-pdfs', 'split-pdf', 'compress-pdf', 'word-to-pdf', 'text-to-word', 'compress-video', 'mp4-to-mp3', 'create-zip', 'extract-zip'].map(
    (slug): ToolContract => ({ slug, status: 'planned', inputs: [], outputs: [], limits: [], capabilities: [], cases: [] }),
  ),
];
