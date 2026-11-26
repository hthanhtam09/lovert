import type { ErrorCode } from './errors.ts';
import type { FileFormat } from './format.ts';

export interface Check {
  id: 'format' | 'size' | 'dimensions' | 'pages' | 'rows' | 'encoding';
  pass: boolean;
  label: string;
}

export interface Output {
  bytes: Uint8Array;
  /** Format detected from the bytes, not the requested one. */
  format: FileFormat;
  width?: number;
  height?: number;
  pageCount?: number;
  quality?: number;
  scale: number;
  checks: Check[];
}

/** Discriminated union: one field (`status`) decides how the UI reacts. */
export type ConversionResult =
  | { status: 'ok'; output: Output }
  | { status: 'over_limit'; output: Output; limitBytes: number; suggestion: string }
  | { status: 'error'; code: ErrorCode; message: string };
