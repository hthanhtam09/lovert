import type { ConversionResult, DataResult, JsonToCsvOptions } from '@lovert/core';
import type { CompressOptions, CompressResponse } from './image/compress';
import type { ImagesToPdfOptions } from './pdf/images-to-pdf';

export type EncoderSupport = Record<'jpeg' | 'png' | 'webp', boolean>;

export type WorkerRequest =
  | { id: number; kind: 'compress'; bytes: Uint8Array; options: CompressOptions }
  | { id: number; kind: 'pdf'; images: Uint8Array[]; options: ImagesToPdfOptions }
  | { id: number; kind: 'data'; direction: 'csv-to-json' | 'json-to-csv'; bytes: Uint8Array; options: JsonToCsvOptions }
  | { id: number; kind: 'probe' }
  /** Stops the running job at the next candidate boundary (an in-flight encode cannot be aborted). */
  | { id: number; kind: 'cancel' };

export type WorkerResponse =
  | { id: number; kind: 'progress'; step: number }
  | { id: number; kind: 'compress-done'; response: CompressResponse }
  | { id: number; kind: 'pdf-done'; result: ConversionResult }
  | { id: number; kind: 'data-done'; result: DataResult }
  | { id: number; kind: 'probe-done'; support: EncoderSupport };
