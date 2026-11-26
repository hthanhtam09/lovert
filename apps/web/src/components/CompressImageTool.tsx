'use client';
import {
  checkImageIntegrity, createJobGuard, detectFormat, formatBytes, HEADER_PROBE_BYTES, isAnimated, readDimensions, formatBytesExact, isImageFormat, LIMITS, mayHaveAlpha, MIME, replaceExtension,
  type ImageFormat,
} from '@lovert/core';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { pixelLimitMessage, WEBP_UNAVAILABLE } from '@/content/messages';
import { FORMAT_NAME, type ImageConversion } from '@/content/tools';
import { track } from '@/lib/analytics';
import type { CompressResponse } from '@/lib/image/compress';
import { canvasSupported } from '@/lib/support';
import { cancelRunnerJobs, loadRunner } from '@/lib/runner-client';
import { useObjectUrl } from '@/lib/use-object-url';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checks } from './Checks';
import { FilePicker } from './FilePicker';
import { focusSettings, MobileBar, PaneSwitch, type Pane } from './PaneSwitch';
import { LimitInput, limitToBytes, type LimitState } from './LimitInput';
import s from './tool.module.css';

const FORMAT_LABEL: Record<ImageFormat, string> = { jpeg: 'JPEG', png: 'PNG', webp: 'WebP' };

/**
 * One image pipeline for two kinds of page:
 * - Compress Image: any input, any output format, size limit on by default.
 * - A converter route (`conversion`): fixed input and output format, size limit off by default (optional),
 *   no exact-size controls (Compress Image offers them). Same worker job, checks, preview and download.
 */
export function CompressImageTool({ conversion }: { conversion?: ImageConversion } = {}) {
  const SLUG = conversion?.slug ?? 'compress-image';
  const locked = !!conversion;
  const guard = useRef(createJobGuard());
  const [file, setFile] = useState<File | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [format, setFormat] = useState<ImageFormat>(conversion?.to ?? 'jpeg');
  const [limit, setLimit] = useState<LimitState>({ enabled: !locked, value: '100', unit: 'KB' });
  const [sizeMode, setSizeMode] = useState<'original' | 'custom'>('original');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [allowResize, setAllowResize] = useState(false);
  const [background, setBackground] = useState('#ffffff');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [res, setRes] = useState<CompressResponse | null>(null);
  const [supported, setSupported] = useState(true);
  const [inputAlpha, setInputAlpha] = useState(false);
  /** Transparency possible according to the file's own header bytes (PNG colour type/tRNS, WebP flags), not its name or MIME type. */
  const [headerAlpha, setHeaderAlpha] = useState(false);
  /** APNG or animated WebP (from header bytes): the output keeps the first frame only. */
  const [animated, setAnimated] = useState<ImageFormat | null>(null);
  /** Version of the latest file pick. An older pick that finishes reading later must not touch the UI. */
  const pickSeq = useRef(0);
  /** The pick during which the user last chose an output format: their choice is never overwritten by that pick's default. */
  const formatChosenInPick = useRef(-1);
  /** Name of the file being read and checked (whole-file check can take a moment for large files). */
  const [checking, setChecking] = useState<string | null>(null);
  /** null while probing; verified from bytes produced by the real encoder path. */
  const [webpOk, setWebpOk] = useState<boolean | null>(null);
  const [pane, setPane] = useState<Pane>('preview');
  const [compare, setCompare] = useState<'both' | 'original' | 'output'>('both');

  useEffect(() => {
    // Syncing with external state (browser features, URL) after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(canvasSupported());
    // Prefill only: ?max=50 sets 50 KB. The canonical URL never includes it.
    const max = Number(new URLSearchParams(window.location.search).get('max'));
    if (Number.isFinite(max) && max > 0 && max < 100_000) setLimit((l) => ({ ...l, enabled: true, value: String(max), unit: 'KB' }));
    let alive = true;
    loadRunner()
      .then((m) => m.encoderSupport())
      .then((sup) => {
        if (!alive) return;
        setWebpOk(sup.webp);
        if (!sup.webp && !locked) setFormat((f) => (f === 'webp' ? 'jpeg' : f));
      })
      .catch(() => alive && setWebpOk(false));
    return () => {
      alive = false;
    };
  }, [locked]);

  const [beforeUrl, setBefore] = useObjectUrl();
  const [afterUrl, setAfter] = useObjectUrl();

  /**
   * Any change that can alter the output or its within/over-limit status makes the current result stale:
   * drop the preview, status and download at once, and discard the running job (its late result is ignored by the guard).
   */
  function invalidate() {
    guard.current.cancel();
    cancelRunnerJobs();
    setRes(null);
    setAfter(null);
    setBusy(false);
    setProgress(0);
    setCompare('both');
  }
  /** Every settings change invalidates the old result before the new value is applied. */
  function change<T>(set: (v: T) => void, v: T) {
    invalidate();
    set(v);
  }

  async function pick(files: File[]) {
    const seq = ++pickSeq.current; // taken before any async read: only the latest pick may update the UI
    const current = () => seq === pickSeq.current;
    invalidate();
    setInputError(null);
    setInputAlpha(false);
    const f = files[0] ?? null;
    if (!f) return;
    // The previous file is no longer selected: nothing can be compressed until the new one is checked.
    setFile(null);
    setBefore(null);
    setHeaderAlpha(false);
    setAnimated(null);
    setChecking(f.name);
    const reject = (msg: string) => (setChecking(null), setInputError(msg), setPane('settings'));
    if (f.size === 0) return reject('That file is empty. Choose another image.');
    if (f.size > LIMITS.maxInputBytes) return reject('That file is larger than 50 MB.');
    let head: Uint8Array;
    try {
      head = new Uint8Array(await f.slice(0, HEADER_PROBE_BYTES).arrayBuffer());
    } catch {
      if (current()) reject('That file could not be read. Choose it again.');
      return;
    }
    if (!current()) return;
    const real = detectFormat(head);
    if (!isImageFormat(real)) return reject('That is not a JPG, PNG or WebP image (checked from the file contents).');
    if (conversion && real !== conversion.from)
      return reject(
        `That file is a ${FORMAT_NAME[real]} image, not ${FORMAT_NAME[conversion.from]} (checked from the file contents, not the name). Choose a ${FORMAT_NAME[conversion.from]} file, or use Compress Image to convert any image.`,
      );
    // Refuse oversized images from the header, before anything decodes them.
    const dims = readDimensions(head, real);
    if (dims && (dims.width * dims.height > LIMITS.maxPixels || Math.max(dims.width, dims.height) > LIMITS.maxCanvasSide))
      return reject(pixelLimitMessage(dims.width, dims.height));
    // Whole-file structure check (JPEG markers, PNG chunks, WebP RIFF size): some browsers decode a cut-off file without an error.
    try {
      const all = f.size <= head.length ? head : new Uint8Array(await f.arrayBuffer());
      if (!current()) return;
      checkImageIntegrity(all, real);
    } catch (e) {
      if (current()) reject(`${e instanceof Error && e.message ? e.message : 'This image is damaged.'} Choose another image.`);
      return;
    }
    if (!current()) return;
    setChecking(null);
    setFile(f);
    setBefore(f);
    setHeaderAlpha(mayHaveAlpha(head, real));
    setAnimated(isAnimated(head, real) ? real : null);
    setPane('settings');
    if (!locked && formatChosenInPick.current !== seq) setFormat(real === 'webp' && webpOk === false ? 'jpeg' : real);
  }

  async function run() {
    if (!file) return;
    const limitBytes = limitToBytes(limit);
    if (limitBytes === 'invalid') return setInputError('Enter a size limit greater than 0.');
    let size: { width: number; height: number } | undefined;
    if (sizeMode === 'custom' && !locked) {
      const w = Math.round(Number(width));
      const h = Math.round(Number(height));
      if (!(w > 0 && h > 0)) return setInputError('Enter a width and height in pixels, or keep the original size.');
      size = { width: w, height: h };
    }
    setInputError(null);
    const id = guard.current.start();
    setBusy(true);
    setRes(null);
    setAfter(null);
    setProgress(0);
    track('tool_started', { slug: SLUG });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const runner = await loadRunner();
    if (!guard.current.isCurrent(id)) return; // replaced while reading: never send the stale job
    const r = await runner.runCompress(bytes, { format, limitBytes, size, allowResize: allowResize && limitBytes !== undefined, background, formatLocked: locked }, (p) => guard.current.isCurrent(id) && setProgress(p));
    if (!guard.current.isCurrent(id)) return; // a newer file or job replaced this one
    setBusy(false);
    setRes(r);
    // Preview and download share this one Blob built from the final bytes.
    if (r.result.status !== 'error') setAfter(new Blob([r.result.output.bytes as BlobPart], { type: MIME[r.result.output.format] }));
    setInputAlpha(!!r.info?.hasAlpha);
    setPane('settings');
    if (r.result.status === 'ok') track('conversion_completed', { slug: SLUG, sizeBytes: r.result.output.bytes.length });
    else track('conversion_failed', { slug: SLUG, code: r.result.status === 'error' ? r.result.code : 'OVER_LIMIT' });
  }

  const r = res?.result;
  const info = res?.info;
  const out = r && r.status !== 'error' ? r.output : null;
  const fileName = file && out ? replaceExtension(file.name, out.format) : 'image';

  if (!supported)
    return <p role="alert" className={s.error}>This browser cannot draw images on a canvas, so it cannot compress images. Try a current version of Chrome, Edge, Firefox or Safari.</p>;

  const ok = r?.status === 'ok';
  const over = r?.status === 'over_limit';
  const webpBlocked = locked && format === 'webp' && webpOk === false;
  const fromName = conversion ? FORMAT_NAME[conversion.from] : '';
  const toName = FORMAT_NAME[format];
  const picker = (compact: boolean) => (
    <FilePicker
      compact={compact}
      mark={conversion ? fromName : 'JPG'}
      title={conversion ? `Convert a ${fromName} image to ${toName}` : 'Reduce an image to a target file size'}
      accept={conversion ? MIME[conversion.from] : 'image/jpeg,image/png,image/webp'}
      label={conversion ? `Choose a ${fromName} image` : 'Choose an image'}
      hint={conversion ? `Or drop a ${fromName} here. Up to 50 MB and 50 megapixels.` : 'Or drop a JPG, PNG or WebP here. Up to 50 MB and 50 megapixels.'}
      onFiles={pick}
    />
  );
  const adjust = () => {
    setPane('settings');
    requestAnimationFrame(() => focusSettings('ci'));
  };

  return (
    <div className={s.tool} data-pane={pane} data-webp-encoder={webpOk === null ? 'pending' : webpOk ? 'yes' : 'no'}>
      <PaneSwitch pane={pane} onChange={setPane} previewLabel="Preview" settingsLabel={out ? 'Result' : 'Settings'} previewId="ci-preview" settingsId="ci-inspector" />
      <div className={s.workspace}>
        <section id="ci-preview" className={`${s.pane} ${s.previewPane}`} aria-labelledby="ci-files">
          <header className={s.paneHead}>
            <h2 id="ci-files">Preview</h2>
            {out && (
              <div className={s.compareControls} role="group" aria-label="Image comparison">
                {(['both', 'original', 'output'] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={compare === m} onClick={() => setCompare(m)}>
                    {m === 'both' ? 'Compare' : m === 'original' ? 'Original' : 'Output'}
                  </button>
                ))}
              </div>
            )}
            {(file || checking) && picker(true)}
          </header>
          <div className={`${s.canvas} ${file || checking ? '' : s.canvasFill}`}>
            {!file && !checking && picker(false)}
            {checking && !file && <p className={s.hint}>Checking {checking}…</p>}
            {file && (
              <div className={s.compare} data-compare={out ? compare : 'both'}>
                <figure className={s.beforeFig}>
                  {beforeUrl && <img src={beforeUrl} alt="Original image" />}
                  <figcaption>
                    <strong>Original</strong> · {info && `${FORMAT_LABEL[info.inputFormat]} · ${info.inputWidth}×${info.inputHeight}px · `}
                    {formatBytes(file.size)}
                  </figcaption>
                </figure>
                {out && (
                  <figure className={s.afterFig}>
                    {afterUrl && <img src={afterUrl} alt={locked ? 'Converted image' : 'Compressed image'} data-testid="after-img" />}
                    <figcaption data-testid="after-caption">
                      After · {out.format === 'pdf' ? 'PDF' : FORMAT_LABEL[out.format]} · {out.width}×{out.height}px · {formatBytes(out.bytes.length)}
                      {out.quality !== undefined && ` · quality ${Math.round(out.quality * 100)}`}
                    </figcaption>
                  </figure>
                )}
              </div>
            )}
            {file && (
              <p className={s.meta}>
                Selected: <strong>{file.name}</strong> · {formatBytes(file.size)}
              </p>
            )}
            <p className="text-sm text-muted-foreground">Files are processed on this device and never uploaded. <Link href="/privacy">Privacy</Link></p>
          </div>
        </section>

        <form
          id="ci-inspector"
          className={`${s.pane} ${s.inspector}`}
          aria-labelledby="ci-settings"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <header className={s.paneHead}>
            <h2 id="ci-settings">{out ? 'Result' : 'Settings'}</h2>
            {out && <Badge variant={ok ? 'secondary' : 'destructive'}>{ok ? (r.status === 'ok' && out.checks.some((c) => c.id === 'size') ? 'Within limit' : 'Checked') : 'Over limit'}</Badge>}
          </header>
          <div className={s.body}>
            <div role="status" aria-live="polite" className={s.status}>
              {checking && `Checking ${checking}…`}
              {busy && `Working… tried ${progress} candidate${progress === 1 ? '' : 's'}.`}
              {ok && 'Done. The result passed all checks.'}
              {r?.status === 'over_limit' && 'The result is over the limit. See the numbers below.'}
            </div>
            {inputError && <p role="alert" className={s.error}>{inputError}</p>}
            {webpBlocked && (
              <p role="alert" className={s.error}>
                {WEBP_UNAVAILABLE} This page cannot create WebP in this browser. <Link href="/help#webp-unavailable">Help</Link>
              </p>
            )}
            {animated && file && (
              <p className={s.warn} data-testid="animated-note">
                This is an animated {FORMAT_NAME[animated]}. {toName} output keeps only the first frame; the animation is not kept.
              </p>
            )}
            {r?.status === 'error' && r.code !== 'CANCELLED' && (
              <p role="alert" className={s.error}>
                {r.message} <span className={s.code}>({r.code})</span>
              </p>
            )}
            {out && (
              <section className={s.summary} role="region" aria-labelledby="ci-result">
                <h3 id="ci-result" className={s.sectionLabel}>{ok ? 'Result' : 'Result (over the limit)'}</h3>
                <p className={s.bigSize}>{formatBytes(out.bytes.length)}</p>
                {r?.status === 'over_limit' && (
                  <p className={s.warn} data-testid="over-limit">
                    Smallest file: {formatBytesExact(out.bytes.length)}, limit {formatBytesExact(r.limitBytes)}, so it is{' '}
                    <strong>{formatBytesExact(out.bytes.length - r.limitBytes)} over</strong>. {r.suggestion} <Link href="/help#output-too-large">More help</Link>
                  </p>
                )}
                <dl className={s.facts}>
                  <div><dt>Output</dt><dd>{out.format === 'pdf' ? 'PDF' : FORMAT_LABEL[out.format]} · {out.width}×{out.height}px</dd></div>
                  <div><dt>Exact size</dt><dd>{formatBytesExact(out.bytes.length)}</dd></div>
                </dl>
                <Checks checks={out.checks} />
              </section>
            )}
            {locked && (
              <fieldset className={s.fieldset}>
                <legend>Output</legend>
                <p className={s.hint}>
                  {toName}
                  {format === 'png' && ' (lossless). Pixels are kept exactly; the file is often larger than the original.'}
                  {format === 'webp' && ', quality 85. Transparency is kept.'}
                  {format === 'jpeg' && ', quality 85. JPG cannot store transparency.'}
                  {' '}Same pixel size as the image you see, turned upright from its EXIF orientation.
                </p>
                {format === 'jpeg' && (
                  <div className={s.row}>
                    <Label htmlFor="ci-bg">{inputAlpha || headerAlpha ? 'This image can have transparent areas. Fill them with' : 'Fill colour for any transparent areas'}</Label>
                    <input id="ci-bg" type="color" value={background} onChange={(e) => change(setBackground, e.target.value)} />
                  </div>
                )}
              </fieldset>
            )}
            <LimitInput idPrefix="ci" value={limit} onChange={(l) => change(setLimit, l)} />
            {locked && limit.enabled && (
              <div className={s.inline}>
                <Checkbox id="ci-allow-resize" checked={allowResize} onCheckedChange={(c) => change(setAllowResize, c === true)} />
                <Label htmlFor="ci-allow-resize">Allow smaller dimensions if needed to meet the limit</Label>
              </div>
            )}
            {locked && (
              <p className={s.hint}>
                Need exact pixel dimensions, or to compare formats? Use <Link href={`/compress-image`}>Compress Image</Link>.
              </p>
            )}
            {!locked && (
            <fieldset className={s.fieldset}>
              <legend>Output format</legend>
              <RadioGroup className="flex flex-wrap gap-x-5 gap-y-2" value={format} onValueChange={(v) => ((formatChosenInPick.current = pickSeq.current), change(setFormat, v as ImageFormat))} aria-label="Output format">
                {(['jpeg', 'webp', 'png'] as const).map((f) => (
                  <div key={f} className={s.inline}>
                    <RadioGroupItem
                      id={`ci-format-${f}`}
                      value={f}
                      disabled={(f === 'webp' && webpOk === false) || checking !== null}
                      aria-describedby={f === 'webp' && webpOk === false ? 'ci-webp-note' : undefined}
                    />
                    <Label htmlFor={`ci-format-${f}`}>{FORMAT_LABEL[f]}</Label>
                  </div>
                ))}
              </RadioGroup>
              {webpOk === false && (
                <p id="ci-webp-note" className={s.hint}>
                  {WEBP_UNAVAILABLE} <Link href="/help#webp-unavailable">Help</Link>
                </p>
              )}
              {format === 'png' && <p className={s.hint}>PNG is lossless: only smaller dimensions reduce its size.</p>}
              {format === 'jpeg' && (inputAlpha || headerAlpha) && (
                <div className={s.row}>
                  <Label htmlFor="ci-bg">JPEG has no transparency. Fill transparent areas with</Label>
                  <input id="ci-bg" type="color" value={background} onChange={(e) => change(setBackground, e.target.value)} />
                </div>
              )}
            </fieldset>
            )}
            {!locked && (
            <fieldset className={s.fieldset}>
              <legend>Dimensions</legend>
              <RadioGroup className="gap-2" value={sizeMode} onValueChange={(v) => change(setSizeMode, v as 'original' | 'custom')} aria-label="Dimensions">
                <div className={s.inline}>
                  <RadioGroupItem id="ci-size-original" value="original" />
                  <Label htmlFor="ci-size-original">Keep original</Label>
                </div>
                <div className={s.inline}>
                  <RadioGroupItem id="ci-size-custom" value="custom" />
                  <Label htmlFor="ci-size-custom">Exact size</Label>
                </div>
              </RadioGroup>
              {sizeMode === 'custom' && (
                <div className={s.row}>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ci-width">Width (px)</Label>
                    <Input id="ci-width" className="h-11 w-28" inputMode="numeric" value={width} onChange={(e) => change(setWidth, e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ci-height">Height (px)</Label>
                    <Input id="ci-height" className="h-11 w-28" inputMode="numeric" value={height} onChange={(e) => change(setHeight, e.target.value)} />
                  </div>
                </div>
              )}
              <div className={s.inline}>
                <Checkbox
                  id="ci-allow-resize"
                  checked={allowResize && sizeMode === 'original'}
                  disabled={sizeMode === 'custom'}
                  onCheckedChange={(c) => change(setAllowResize, c === true)}
                />
                <Label htmlFor="ci-allow-resize">Allow smaller dimensions if needed to meet the limit</Label>
              </div>
              {sizeMode === 'custom' && <p className={s.hint}>With an exact size, the dimensions are never changed.</p>}
            </fieldset>
            )}
          </div>
          <div className={s.actions}>
            {over && (
              <Button type="button" size="lg" className={`h-11 w-full text-base font-semibold ${s.primaryFirst}`} onClick={adjust}>
                Adjust settings
              </Button>
            )}
            {out && afterUrl && (
              <Button asChild size="lg" variant={ok ? 'default' : 'outline'} className={`h-11 w-full text-base font-semibold ${ok ? s.primaryFirst : s.quietOnMobile}`}>
                <a
                  href={afterUrl}
                  download={fileName}
                  data-testid="download"
                  onClick={() => track('download_clicked', { slug: SLUG, sizeBytes: out.bytes.length })}
                >
                  Download {fileName} ({formatBytes(out.bytes.length)}){over ? ' anyway' : ''}
                </a>
              </Button>
            )}
            {ok && (
              <Button type="button" size="lg" variant="ghost" className={`${s.mobileOnly} h-11 w-full text-base font-semibold ${s.quietOnMobile}`} onClick={adjust}>
                Adjust settings
              </Button>
            )}
            <Button type="submit" size="lg" variant={out ? 'outline' : 'default'} className={`h-11 w-full text-base font-semibold ${out ? s.hideOnMobileResult : ''}`} disabled={!file || busy || webpBlocked}>
              {busy ? (locked ? 'Converting…' : 'Compressing…') : locked ? `Convert to ${toName}` : 'Compress'}
            </Button>
          </div>
        </form>
      </div>
      <MobileBar pane={pane} label={out ? 'View result' : 'Review settings'} disabled={!file} onClick={() => setPane('settings')} />
    </div>
  );
}
