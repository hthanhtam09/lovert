'use client';
import {
  checkImageIntegrity, createJobGuard, detectFormat, HEADER_PROBE_BYTES, readDimensions, formatBytes, formatBytesExact, isImageFormat, LIMITS, moveItem, PAGE_SIZES, pdfAdmission,
  type ConversionResult, type PageSizeId,
} from '@lovert/core';
import dynamic from 'next/dynamic';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { pdfPixelLimitReason } from '@/content/messages';
import { track } from '@/lib/analytics';
import { canvasSupported } from '@/lib/support';
import { cancelRunnerJobs, loadRunner } from '@/lib/runner-client';
import { useObjectUrl } from '@/lib/use-object-url';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Checks } from './Checks';
import { FilePicker } from './FilePicker';
import { focusSettings, MobileBar, PaneSwitch, type Pane } from './PaneSwitch';
import { LimitInput, limitToBytes, type LimitState } from './LimitInput';
import s from './tool.module.css';

const PdfPreview = dynamic(() => import('./PdfPreview').then((m) => m.PdfPreview), { ssr: false });
const SLUG = 'images-to-pdf';

interface Item {
  id: number;
  file: File;
  url: string;
}

let nextItem = 0;

export function ImagesToPdfTool() {
  const guard = useRef(createJobGuard());
  const [items, setItems] = useState<Item[]>([]);
  const [pane, setPane] = useState<Pane>('preview');
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const [page, setPage] = useState<PageSizeId>('a4');
  const [margin, setMargin] = useState(18);
  const [limit, setLimit] = useState<LimitState>({ enabled: false, value: '1', unit: 'MB' });
  const [allowResize, setAllowResize] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection after hydration
  useEffect(() => setSupported(canvasSupported()), []);
  // Revoke every thumbnail URL on unmount.
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  const out = result && result.status !== 'error' ? result.output : null;
  const [pdfUrl, setPdfUrl] = useObjectUrl();

  function invalidate() {
    guard.current.cancel();
    cancelRunnerJobs(); // synchronous: never cancels a job sent after this point
    setResult(null);
    setPdfUrl(null);
    setBusy(false);
  }

  /** Batches are processed one after another, so a later batch can never land before an earlier one. */
  const addQueue = useRef<Promise<void>>(Promise.resolve());
  const listRef = useRef<HTMLOListElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  /** Where keyboard focus goes after the list re-renders (move/remove). */
  const pendingFocus = useRef<{ id: number; prefer: 'up' | 'down' | 'remove' } | 'picker' | null>(null);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === 'picker') return panelRef.current?.querySelector<HTMLInputElement>('input[type=file]')?.focus();
    const row = listRef.current?.querySelector<HTMLElement>(`[data-item="${target.id}"]`);
    // Prefer the same action on the same item; if that button is now disabled (top/bottom), use the other direction.
    const order = target.prefer === 'up' ? ['up', 'down', 'remove'] : target.prefer === 'down' ? ['down', 'up', 'remove'] : ['remove'];
    for (const act of order) {
      const b = row?.querySelector<HTMLButtonElement>(`[data-act="${act}"]`);
      if (b && !b.disabled) return b.focus();
    }
  }, [items]);

  function add(files: File[]) {
    invalidate();
    setError(null);
    const run = addQueue.current.then(() => addBatch(files));
    addQueue.current = run.catch(() => {});
    return run;
  }

  async function addBatch(files: File[]) {
    const accepted: Item[] = [];
    const rejected: string[] = [];
    // Current list (ref, not a stale render value) so the image-count and total-size limits hold across batches.
    let count = itemsRef.current.length;
    let total = itemsRef.current.reduce((n, i) => n + i.file.size, 0);
    for (const f of files) {
      if (pdfAdmission({ count, totalBytes: total }, 0) === 'too_many') {
        rejected.push(`${f.name} (over ${LIMITS.maxPdfImages} images)`);
        continue;
      }
      let head: Uint8Array;
      try {
        head = new Uint8Array(await f.slice(0, HEADER_PROBE_BYTES).arrayBuffer());
      } catch {
        rejected.push(`${f.name} (could not be read)`);
        continue;
      }
      const fmt = detectFormat(head);
      const dims = isImageFormat(fmt) ? readDimensions(head, fmt) : null;
      if (f.size === 0) rejected.push(`${f.name} (empty)`);
      else if (f.size > LIMITS.maxInputBytes) rejected.push(`${f.name} (over 50 MB)`);
      else if (!isImageFormat(fmt)) rejected.push(`${f.name} (not JPG, PNG or WebP)`);
      else if (dims && (dims.width * dims.height > LIMITS.maxPixels || Math.max(dims.width, dims.height) > LIMITS.maxCanvasSide))
        rejected.push(pdfPixelLimitReason(f.name, dims.width, dims.height));
      else if (pdfAdmission({ count, totalBytes: total }, f.size) === 'too_large')
        rejected.push(`${f.name} (the images would add up to more than ${LIMITS.maxPdfTotalInputBytes / 1e6} MB)`);
      else {
        // Whole-file structure check: never put a cut-off image in the list (some browsers decode it partially without an error).
        try {
          checkImageIntegrity(f.size <= head.length ? head : new Uint8Array(await f.arrayBuffer()), fmt);
        } catch {
          rejected.push(`${f.name} (damaged or incomplete ${fmt === 'jpeg' ? 'JPEG' : fmt === 'png' ? 'PNG' : 'WebP'})`);
          continue;
        }
        accepted.push({ id: ++nextItem, file: f, url: URL.createObjectURL(f) });
        count++;
        total += f.size;
      }
    }
    if (accepted.length) {
      itemsRef.current = [...itemsRef.current, ...accepted]; // the next queued batch must see these immediately
      setItems((l) => [...l, ...accepted]);
    }
    setError(rejected.length ? `Skipped: ${rejected.join(', ')}.` : null);
    if (rejected.length) setPane('settings');
    const names = accepted.map((a) => a.file.name).join(', ');
    setMessage(accepted.length ? `${accepted.length} image${accepted.length === 1 ? '' : 's'} added: ${names}.` : 'No images added.');
  }

  function move(id: number, delta: -1 | 1) {
    const from = items.findIndex((i) => i.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= items.length) return;
    invalidate();
    pendingFocus.current = { id, prefer: delta < 0 ? 'up' : 'down' };
    setItems(moveItem(items, from, to));
    setMessage(`${items[from]!.file.name} moved to position ${to + 1} of ${items.length}.`);
  }

  function remove(id: number) {
    const index = items.findIndex((i) => i.id === id);
    const it = items[index];
    if (!it) return;
    invalidate();
    URL.revokeObjectURL(it.url);
    const next = items.filter((i) => i.id !== id);
    // Focus the item that took its place, else the previous one, else the file picker.
    const neighbour = next[index] ?? next[index - 1];
    pendingFocus.current = neighbour ? { id: neighbour.id, prefer: 'remove' } : 'picker';
    setItems(next);
    setMessage(`${it.file.name} removed. ${next.length} image${next.length === 1 ? '' : 's'} left.`);
  }

  async function run() {
    const limitBytes = limitToBytes(limit);
    if (limitBytes === 'invalid') return setError('Enter a size limit greater than 0.');
    if (!items.length) return;
    setError(null);
    const id = guard.current.start();
    setBusy(true);
    setResult(null);
    setPdfUrl(null);
    setProgress(0);
    track('tool_started', { slug: SLUG });
    const sent = items;
    const buffers = await Promise.all(sent.map(async (i) => new Uint8Array(await i.file.arrayBuffer())));
    const runner = await loadRunner();
    if (!guard.current.isCurrent(id)) return; // replaced while reading: never send the stale job
    const r = await runner.runImagesToPdf(buffers, { page, marginPt: margin, limitBytes, allowResize }, (p) => guard.current.isCurrent(id) && setProgress(p));
    if (!guard.current.isCurrent(id)) return;
    setBusy(false);
    // Errors from the worker name the position ("Image 2: …"); show the file name the user knows.
    const named =
      r.status === 'error'
        ? { ...r, message: r.message.replace(/^Image (\d+): /, (m, n: string) => (sent[Number(n) - 1] ? `${sent[Number(n) - 1]!.file.name} (page ${n}): ` : m)) }
        : r;
    setResult(named);
    // Preview renders r.output.bytes; download uses a Blob of the same bytes.
    setPane('settings');
    if (r.status !== 'error') setPdfUrl(new Blob([r.output.bytes as BlobPart], { type: 'application/pdf' }));
    if (r.status === 'ok') track('conversion_completed', { slug: SLUG, sizeBytes: r.output.bytes.length });
    else track('conversion_failed', { slug: SLUG, code: r.status === 'error' ? r.code : 'OVER_LIMIT' });
  }

  if (!supported) return <p role="alert" className={s.error}>This browser cannot draw images on a canvas, so it cannot build the PDF.</p>;

  const ok = result?.status === 'ok';
  const picker = (compact: boolean) => (
    <FilePicker
      compact={compact}
      mark="PDF"
      title="Arrange your images and combine them into one PDF"
      accept="image/jpeg,image/png,image/webp"
      multiple
      label="Add images"
      hint={`Or drop JPG, PNG or WebP files here. Up to ${LIMITS.maxPdfImages} images, 50 MB each, ${LIMITS.maxPdfTotalInputBytes / 1e6} MB in total.`}
      onFiles={add}
    />
  );

  return (
    <div className={s.tool} data-pane={pane}>
      <PaneSwitch pane={pane} onChange={setPane} previewLabel="Pages" settingsLabel={out ? 'Result' : 'Settings'} previewId="pdf-preview" settingsId="pdf-inspector" />
      {/* Outside both panes so it stays visible (and announced) whichever pane is shown on small screens. */}
      <div role="status" aria-live="polite" className={`${s.status} ${s.toolStatus}`}>
        {busy ? `Working… pass ${progress}.` : message}
        {ok && ' PDF created and checked.'}
      </div>
      <div className={s.workspace}>
        <section id="pdf-preview" ref={panelRef} className={`${s.pane} ${s.previewPane}`} aria-labelledby="pdf-files">
          <header className={s.paneHead}>
            <h2 id="pdf-files">Page order</h2>
            {items.length > 0 && picker(true)}
          </header>
          <div className={`${s.canvas} ${items.length ? '' : s.canvasFill}`}>
            {!items.length && picker(false)}
            {out && (
              <div>
                <p className={s.sectionLabel}>Exported PDF</p>
                <PdfPreview bytes={out.bytes} />
              </div>
            )}
            {items.length > 0 && (
              <ol ref={listRef} className={s.tiles} aria-label="Pages in order">
                {items.map((it, i) => (
                  <li key={it.id} className={s.tile} data-item={it.id}>
                    <img src={it.url} alt="" />
                    <span className={s.itemName}>
                      <span className={s.pageNo}>Page {i + 1}</span> {it.file.name} · {formatBytes(it.file.size)}
                    </span>
                    <Button type="button" variant="secondary" size="icon-lg" data-act="up" onClick={() => move(it.id, -1)} disabled={i === 0} aria-label={`Move ${it.file.name} up (page ${i + 1})`}>
                      <ArrowUp />
                    </Button>
                    <Button type="button" variant="secondary" size="icon-lg" data-act="down" onClick={() => move(it.id, 1)} disabled={i === items.length - 1} aria-label={`Move ${it.file.name} down (page ${i + 1})`}>
                      <ArrowDown />
                    </Button>
                    <Button type="button" variant="secondary" size="icon-lg" data-act="remove" onClick={() => remove(it.id)} aria-label={`Remove ${it.file.name} (page ${i + 1})`}>
                      <X />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-sm text-muted-foreground">Files are processed on this device and never uploaded. <Link href="/privacy">Privacy</Link></p>
          </div>
        </section>

        <form
          id="pdf-inspector"
          className={`${s.pane} ${s.inspector}`}
          aria-labelledby="pdf-settings"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <header className={s.paneHead}>
            <h2 id="pdf-settings">{out ? 'Result' : 'Settings'}</h2>
            {out && <Badge variant={ok ? 'secondary' : 'destructive'}>{ok ? 'Within limit' : 'Over limit'}</Badge>}
          </header>
          <div className={s.body}>
            {error && <p role="alert" className={s.error}>{error}</p>}
            {result?.status === 'error' && result.code !== 'CANCELLED' && (
              <p role="alert" className={s.error}>
                {result.message} <span className={s.code}>({result.code})</span>
              </p>
            )}
            {out && (
              <section className={s.summary} role="region" aria-labelledby="pdf-result">
                <h3 id="pdf-result" className={s.sectionLabel}>{ok ? 'Your PDF' : 'Your PDF (over the limit)'}</h3>
                <p className={s.bigSize}>{formatBytes(out.bytes.length)}</p>
                {result?.status === 'over_limit' && (
                  <p className={s.warn} data-testid="over-limit">
                    Smallest PDF: {formatBytesExact(out.bytes.length)}, limit {formatBytesExact(result.limitBytes)}, so it is{' '}
                    <strong>{formatBytesExact(out.bytes.length - result.limitBytes)} over</strong>. {result.suggestion} <Link href="/help#output-too-large">More help</Link>
                  </p>
                )}
                <p className={s.meta} data-testid="pdf-meta">
                  {out.pageCount} page{out.pageCount === 1 ? '' : 's'} · {formatBytes(out.bytes.length)}
                  {out.quality !== undefined && ` · JPEG quality ${Math.round(out.quality * 100)}`}
                  {out.scale < 1 && ` · images at ${Math.round(out.scale * 100)}% resolution`}
                </p>
                <Checks checks={out.checks} />
              </section>
            )}
            <fieldset className={s.fieldset}>
              <legend>Page</legend>
              <div className={s.row}>
                <div className="grid gap-1.5">
                  <Label htmlFor="pdf-paper">Paper</Label>
                  <NativeSelect id="pdf-paper" className="h-11" value={page} onChange={(e) => (invalidate(), setPage(e.target.value as PageSizeId))}>
                    <NativeSelectOption value="a4">{PAGE_SIZES.a4.label}</NativeSelectOption>
                    <NativeSelectOption value="letter">{PAGE_SIZES.letter.label}</NativeSelectOption>
                    <NativeSelectOption value="fit">Same as each image</NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pdf-margin">Margin</Label>
                  <NativeSelect id="pdf-margin" className="h-11" value={margin} onChange={(e) => (invalidate(), setMargin(Number(e.target.value)))}>
                    <NativeSelectOption value={0}>None</NativeSelectOption>
                    <NativeSelectOption value={18}>Small (6 mm)</NativeSelectOption>
                    <NativeSelectOption value={36}>Normal (13 mm)</NativeSelectOption>
                  </NativeSelect>
                </div>
              </div>
              <p className={s.hint}>Each image is scaled to fit its page without cropping. Landscape images get landscape pages.</p>
            </fieldset>
            <LimitInput idPrefix="pdf" value={limit} onChange={(l) => (invalidate(), setLimit(l))} />
            <div className={s.inline}>
              <Checkbox id="pdf-allow-resize" checked={allowResize} onCheckedChange={(c) => (invalidate(), setAllowResize(c === true))} />
              <Label htmlFor="pdf-allow-resize">Allow lower image resolution to meet the limit (small text gets softer)</Label>
            </div>
          </div>
          <div className={s.actions}>
            {result?.status === 'over_limit' && (
              <Button type="button" size="lg" className={`h-11 w-full text-base font-semibold ${s.primaryFirst}`} onClick={() => (setPane('settings'), requestAnimationFrame(() => focusSettings('pdf')))}>
                Adjust settings
              </Button>
            )}
            {out && pdfUrl && (
              <Button asChild size="lg" variant={ok ? 'default' : 'outline'} className={`h-11 w-full text-base font-semibold ${ok ? s.primaryFirst : s.quietOnMobile}`}>
                <a href={pdfUrl} download="images.pdf" data-testid="download" onClick={() => track('download_clicked', { slug: SLUG, sizeBytes: out.bytes.length })}>
                  Download images.pdf ({formatBytes(out.bytes.length)}){result?.status === 'over_limit' ? ' anyway' : ''}
                </a>
              </Button>
            )}
            {ok && (
              <Button type="button" size="lg" variant="ghost" className={`${s.mobileOnly} h-11 w-full text-base font-semibold ${s.quietOnMobile}`} onClick={() => (setPane('settings'), requestAnimationFrame(() => focusSettings('pdf')))}>
                Adjust settings
              </Button>
            )}
            <Button type="submit" size="lg" variant={out ? 'outline' : 'default'} className={`h-11 w-full text-base font-semibold ${out ? s.hideOnMobileResult : ''}`} disabled={!items.length || busy}>
              {busy ? 'Creating PDF…' : 'Create PDF'}
            </Button>
          </div>
        </form>
      </div>
      <MobileBar pane={pane} label={out ? 'View result' : 'Review settings'} disabled={!items.length} onClick={() => setPane('settings')} />
    </div>
  );
}
