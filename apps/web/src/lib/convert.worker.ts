/// <reference lib="webworker" />
import { convertData } from './data/convert';
import { compressImage } from './image/compress';
import { probeEncoders } from './image/surface';
import { imagesToPdf } from './pdf/images-to-pdf';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
/** Id of the only job allowed to continue. A new job or a cancel message replaces it. */
let current = 0;

scope.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (req.kind === 'probe') return post({ id: req.id, kind: 'probe-done', support: await probeEncoders() });
  current = req.id;
  if (req.kind === 'cancel') return;
  const hooks = {
    isCancelled: () => current !== req.id,
    onProgress: (step: number) => post({ id: req.id, kind: 'progress', step }),
  };
  if (req.kind === 'compress') {
    const response = await compressImage(req.bytes, req.options, hooks);
    const out = response.result.status !== 'error' ? [response.result.output.bytes.buffer as ArrayBuffer] : [];
    post({ id: req.id, kind: 'compress-done', response }, out);
  } else if (req.kind === 'data') {
    const result = convertData(req.direction, req.bytes, req.options);
    post({ id: req.id, kind: 'data-done', result }, result.status === 'ok' ? [result.output.bytes.buffer as ArrayBuffer] : []);
  } else {
    const result = await imagesToPdf(req.images, req.options, hooks);
    const out = result.status !== 'error' ? [result.output.bytes.buffer as ArrayBuffer] : [];
    post({ id: req.id, kind: 'pdf-done', result }, out);
  }
};

function post(msg: WorkerResponse, transfer: Transferable[] = []) {
  scope.postMessage(msg, transfer);
}
