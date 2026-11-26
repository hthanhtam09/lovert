'use client';
import { ErrorCodes, type ConversionResult, type DataResult, type JsonToCsvOptions } from '@lovert/core';
import type { CompressOptions, CompressResponse } from './image/compress';
import type { ImagesToPdfOptions } from './pdf/images-to-pdf';
import type { EncoderSupport, WorkerRequest, WorkerResponse } from './worker-protocol';

/** `probe` requests are never discarded: a file pick must not turn the encoder probe into "unsupported". */
type Pending = { resolve: (r: WorkerResponse) => void; onProgress?: ((s: number) => void) | undefined; probe?: boolean };
type NoId<T> = T extends unknown ? Omit<T, 'id'> : never;

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();
const CANCELLED = { status: 'error', code: ErrorCodes.CANCELLED, message: 'Cancelled' } as const;

export function workerSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function';
}

/**
 * Two different things happen when a job is replaced:
 * - "discarded": the UI stops waiting immediately (performance mark `lovert:job-discarded`).
 * - "stopped": the worker later reports the old job ended early with CANCELLED (`lovert:job-stopped`).
 * - If the old job finished before the stop arrived, its result is dropped (`lovert:job-late-result`).
 * Marks carry no file data; they make the behaviour observable in tests and DevTools.
 */
function mark(name: string) {
  try {
    performance.mark(name);
  } catch {
    /* ignore */
  }
}

function isCancelledMsg(m: WorkerResponse): boolean {
  if (m.kind === 'pdf-done') return m.result.status === 'error' && m.result.code === ErrorCodes.CANCELLED;
  if (m.kind === 'data-done') return m.result.status === 'error' && m.result.code === ErrorCodes.CANCELLED;
  if (m.kind === 'compress-done') return m.response.result.status === 'error' && m.response.result.code === ErrorCodes.CANCELLED;
  return false;
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const p = pending.get(msg.id);
      if (!p) {
        if (isCancelledMsg(msg)) mark('lovert:job-stopped');
        else if (msg.kind !== 'progress') mark('lovert:job-late-result'); // finished before the stop arrived
        return; // result of a discarded job: dropped
      }
      if (msg.kind === 'progress') return p.onProgress?.(msg.step);
      pending.delete(msg.id);
      p.resolve(msg);
    };
  }
  return worker;
}

function discardPending() {
  for (const [oldId, p] of pending) {
    if (p.probe) continue;
    pending.delete(oldId);
    p.resolve({ id: oldId, kind: 'pdf-done', result: CANCELLED });
    mark('lovert:job-discarded');
  }
}

function send(req: NoId<WorkerRequest>, transfer: Transferable[], onProgress?: (s: number) => void): Promise<WorkerResponse> {
  const id = ++nextId;
  if (req.kind !== 'probe') discardPending(); // a new job supersedes older ones
  return new Promise((resolve) => {
    pending.set(id, { resolve, onProgress, probe: req.kind === 'probe' });
    getWorker().postMessage({ ...req, id } as WorkerRequest, transfer);
    if (req.kind !== 'probe') mark('lovert:job-sent');
  });
}

/** Discard the running job's result now and ask the worker to stop it at the next step. */
export function cancelJobs(): void {
  if (!worker) return;
  if (![...pending.values()].some((p) => !p.probe)) return;
  discardPending();
  worker.postMessage({ id: ++nextId, kind: 'cancel' } satisfies WorkerRequest);
}

let probe: Promise<EncoderSupport> | null = null;
/** Which output formats the real encoder path can produce, verified from output bytes. */
export function encoderSupport(): Promise<EncoderSupport> {
  if (!probe) {
    probe = workerSupported()
      ? send({ kind: 'probe' }, []).then((r) => (r.kind === 'probe-done' ? r.support : { jpeg: true, png: true, webp: false }))
      : import('./image/surface').then((m) => m.probeEncoders());
  }
  return probe;
}

export async function runCompress(bytes: Uint8Array, options: CompressOptions, onProgress?: (s: number) => void): Promise<CompressResponse> {
  if (!workerSupported()) {
    const { compressImage } = await import('./image/compress');
    return compressImage(bytes, options, { onProgress });
  }
  const r = await send({ kind: 'compress', bytes, options }, [bytes.buffer as ArrayBuffer], onProgress);
  return r.kind === 'compress-done' ? r.response : { result: CANCELLED };
}

export async function runImagesToPdf(images: Uint8Array[], options: ImagesToPdfOptions, onProgress?: (s: number) => void): Promise<ConversionResult> {
  if (!workerSupported()) {
    const { imagesToPdf } = await import('./pdf/images-to-pdf');
    return imagesToPdf(images, options, { onProgress });
  }
  const r = await send({ kind: 'pdf', images, options }, images.map((b) => b.buffer as ArrayBuffer), onProgress);
  return r.kind === 'pdf-done' ? r.result : CANCELLED;
}

/** CSV ⇄ JSON. Runs in the worker so a large file never freezes the page; main thread when workers are unavailable. */
export async function runData(direction: 'csv-to-json' | 'json-to-csv', bytes: Uint8Array, options: JsonToCsvOptions): Promise<DataResult> {
  if (typeof Worker === 'undefined') {
    const { convertData } = await import('./data/convert');
    return convertData(direction, bytes, options);
  }
  const r = await send({ kind: 'data', direction, bytes, options }, [bytes.buffer as ArrayBuffer]);
  return r.kind === 'data-done' ? r.result : CANCELLED;
}
