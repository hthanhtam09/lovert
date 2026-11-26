'use client';
import { createJobGuard, DATA_PREVIEW_ROWS, formatBytes, formatBytesExact, LIMITS, type DataResult } from '@lovert/core';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { useObjectUrl } from '@/lib/use-object-url';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Checks } from './Checks';
import { FilePicker } from './FilePicker';
import { MobileBar, PaneSwitch, type Pane } from './PaneSwitch';
import s from './tool.module.css';

import { cancelRunnerJobs, loadRunner } from '@/lib/runner-client';

type Direction = 'csv-to-json' | 'json-to-csv';
const CFG = {
  'csv-to-json': { from: 'CSV', to: 'JSON', ext: 'json', mime: 'application/json', accept: '.csv,text/csv,text/plain' },
  'json-to-csv': { from: 'JSON', to: 'CSV', ext: 'csv', mime: 'text/csv', accept: '.json,application/json,text/plain' },
} as const;

/** Pipeline milestones as performance marks (no file data): make a stuck step visible in traces and tests. */
const mark = (name: string) => {
  try {
    performance.mark(`lovert:data-${name}`);
  } catch {
    /* ignore */
  }
};

const outName = (name: string, ext: string) => `${name.replace(/\.[^./\\]+$/, '') || 'data'}.${ext}`;

/**
 * CSV ⇄ JSON in one component. The file is converted as soon as it is picked (and again when an option
 * changes); the newest job wins, so an older, slower result never replaces the current one.
 */
export function DataConvertTool({ direction }: { direction: Direction }) {
  const cfg = CFG[direction];
  const guard = useRef(createJobGuard());
  const [file, setFile] = useState<File | null>(null);
  const [bom, setBom] = useState(true);
  const [protect, setProtect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DataResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>('preview');
  const [url, setUrl] = useObjectUrl();

  async function convert(f: File, options: { bom: boolean; protectFormulas: boolean }) {
    const id = guard.current.start();
    setResult(null);
    setUrl(null);
    setError(null);
    if (f.size === 0) return setError('That file is empty. Choose another file.');
    if (f.size > LIMITS.maxDataInputBytes) return setError(`That file is larger than ${LIMITS.maxDataInputBytes / 1e6} MB. Split it into smaller files.`);
    setBusy(true);
    mark('read-start');
    track('tool_started', { slug: direction });
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await f.arrayBuffer());
      mark('read-done');
    } catch {
      if (guard.current.isCurrent(id)) {
        setBusy(false);
        setError('That file could not be read. Choose it again.');
      }
      return;
    }
    const runner = await loadRunner();
    mark('runner-loaded');
    if (!guard.current.isCurrent(id)) return; // replaced while reading: never send the stale job
    const r = await runner.runData(direction, bytes, options);
    mark(guard.current.isCurrent(id) ? 'result' : 'result-stale');
    if (!guard.current.isCurrent(id)) return; // a newer file or option replaced this job
    setBusy(false);
    setResult(r);
    if (r.status === 'ok') {
      // Preview and download share this one Blob built from the final bytes.
      setUrl(new Blob([r.output.bytes as BlobPart], { type: cfg.mime }));
      mark('download-ready');
      track('conversion_completed', { slug: direction, sizeBytes: r.output.bytes.length });
    } else track('conversion_failed', { slug: direction, code: r.code });
    setPane('settings');
  }

  function invalidate() {
    guard.current.cancel();
    cancelRunnerJobs();
    setResult(null);
    setUrl(null);
    setBusy(false);
  }

  function pick(files: File[]) {
    const f = files[0];
    if (!f) return;
    mark('picked');
    invalidate();
    setFile(f);
    void convert(f, { bom, protectFormulas: protect });
  }

  function option(next: { bom: boolean; protectFormulas: boolean }) {
    invalidate();
    setBom(next.bom);
    setProtect(next.protectFormulas);
    if (file) void convert(file, next);
  }

  const out = result?.status === 'ok' ? result.output : null;
  const fileName = file ? outName(file.name, cfg.ext) : `data.${cfg.ext}`;
  const picker = (compact: boolean) => (
    <FilePicker
      compact={compact}
      mark={cfg.from}
      title={`Convert a ${cfg.from} file to ${cfg.to}`}
      accept={cfg.accept}
      label={`Choose a ${cfg.from} file`}
      hint={`Or drop a UTF-8 ${cfg.from} file here. Up to ${LIMITS.maxDataInputBytes / 1e6} MB and ${LIMITS.maxDataRows.toLocaleString('en-US')} rows.`}
      onFiles={pick}
    />
  );

  return (
    <div className={s.tool} data-pane={pane}>
      <PaneSwitch pane={pane} onChange={setPane} previewLabel="Preview" settingsLabel={out ? 'Result' : 'Settings'} previewId="dt-preview" settingsId="dt-inspector" />
      <div className={s.workspace}>
        <section id="dt-preview" className={`${s.pane} ${s.previewPane}`} aria-labelledby="dt-files">
          <header className={s.paneHead}>
            <h2 id="dt-files">Preview</h2>
            {file && picker(true)}
          </header>
          <div className={`${s.canvas} ${file ? '' : s.canvasFill}`}>
            {!file && picker(false)}
            {out && (
              <>
                <div className={s.dataTableWrap} tabIndex={0} role="region" aria-label="Table preview">
                  <table className={s.dataTable} data-testid="preview-table">
                    <thead>
                      <tr>{out.columns.map((c, k) => <th key={k} scope="col">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {out.previewRows.map((r, k) => (
                        <tr key={k}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {out.rowCount > DATA_PREVIEW_ROWS && (
                  <p className={s.hint}>
                    Showing the first {DATA_PREVIEW_ROWS} of {out.rowCount.toLocaleString('en-US')} rows. The download has every row.
                  </p>
                )}
                <h3 className={s.sectionLabel}>{cfg.to} output{out.previewTruncated ? ' (start of the file)' : ''}</h3>
                <pre className={s.dataText} data-testid="preview-text" tabIndex={0} aria-label={`${cfg.to} output text`}>{out.previewText}</pre>
                {out.previewTruncated && <p className={s.hint}>Preview cut off here. The downloaded file is complete ({formatBytesExact(out.bytes.length)}).</p>}
              </>
            )}
            {file && (
              <p className={s.meta}>
                Selected: <strong>{file.name}</strong> · {formatBytes(file.size)}
              </p>
            )}
            <p className="text-sm text-muted-foreground">Files are processed on this device and never uploaded. <Link href="/privacy">Privacy</Link></p>
          </div>
        </section>

        <form id="dt-inspector" className={`${s.pane} ${s.inspector}`} aria-labelledby="dt-settings" onSubmit={(e) => (e.preventDefault(), file && void convert(file, { bom, protectFormulas: protect }))}>
          <header className={s.paneHead}>
            <h2 id="dt-settings">{out ? 'Result' : 'Settings'}</h2>
            {out && <Badge variant="secondary">Checked</Badge>}
          </header>
          <div className={s.body}>
            <div role="status" aria-live="polite" className={s.status}>
              {busy && `Converting ${file?.name ?? ''}…`}
              {out && `Done. ${out.rowCount.toLocaleString('en-US')} rows converted and checked.`}
            </div>
            {error && <p role="alert" className={s.error}>{error}</p>}
            {result?.status === 'error' && result.code !== 'CANCELLED' && (
              <p role="alert" className={s.error}>
                {result.message} <span className={s.code}>({result.code})</span>
              </p>
            )}
            {out && (
              <section className={s.summary} role="region" aria-labelledby="dt-result">
                <h3 id="dt-result" className={s.sectionLabel}>Result</h3>
                <p className={s.bigSize}>{formatBytes(out.bytes.length)}</p>
                <dl className={s.facts}>
                  <div><dt>Output</dt><dd>{cfg.to} · {out.rowCount.toLocaleString('en-US')} rows · {out.columns.length} columns</dd></div>
                  <div><dt>Exact size</dt><dd>{formatBytesExact(out.bytes.length)}</dd></div>
                </dl>
                <Checks checks={out.checks} />
                {out.notes.length > 0 && (
                  <ul className={s.notes} aria-label="How values were written">
                    {out.notes.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                )}
              </section>
            )}
            {direction === 'json-to-csv' ? (
              <fieldset className={s.fieldset}>
                <legend>CSV options</legend>
                <div className={s.inline}>
                  <Checkbox id="dt-bom" checked={bom} onCheckedChange={(c) => option({ bom: c === true, protectFormulas: protect })} />
                  <Label htmlFor="dt-bom">Add a UTF-8 BOM so Excel shows accented letters correctly</Label>
                </div>
                <div className={s.inline}>
                  <Checkbox id="dt-protect" checked={protect} onCheckedChange={(c) => option({ bom, protectFormulas: c === true })} />
                  <Label htmlFor="dt-protect">Protect against spreadsheet formulas (add &apos; before text starting with = + - @)</Label>
                </div>
                <p className={s.hint}>Columns follow the order keys first appear. Missing keys and null become empty cells; nested objects and arrays are written as JSON text.</p>
              </fieldset>
            ) : (
              <fieldset className={s.fieldset}>
                <legend>How the CSV is read</legend>
                <p className={s.hint}>
                  UTF-8 (a BOM is fine), comma-separated, first row is the header. Every value stays text, so 007 stays &quot;007&quot;. Quoted fields may contain commas, quotes (&quot;&quot;) and line breaks.
                </p>
              </fieldset>
            )}
          </div>
          <div className={s.actions}>
            {out && url && (
              <Button asChild size="lg" className={`h-11 w-full text-base font-semibold ${s.primaryFirst}`}>
                <a href={url} download={fileName} data-testid="download" onClick={() => track('download_clicked', { slug: direction, sizeBytes: out.bytes.length })}>
                  Download {fileName} ({formatBytes(out.bytes.length)})
                </a>
              </Button>
            )}
            {!out && (
              <Button type="submit" size="lg" className="h-11 w-full text-base font-semibold" disabled={!file || busy}>
                {busy ? 'Converting…' : `Convert to ${cfg.to}`}
              </Button>
            )}
          </div>
        </form>
      </div>
      <MobileBar pane={pane} label={out ? 'View result' : 'Review settings'} disabled={!file} onClick={() => setPane('settings')} />
    </div>
  );
}
