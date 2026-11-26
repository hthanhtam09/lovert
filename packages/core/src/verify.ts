import { detectFormat, type FileFormat } from './format.ts';
import type { Check } from './result.ts';
import { formatBytes, formatBytesExact } from './units.ts';

export interface VerifyInput {
  bytes: Uint8Array;
  requestedFormat: FileFormat;
  limitBytes?: number | undefined;
  expected?: { width: number; height: number } | undefined;
  actual?: { width: number; height: number } | undefined;
  expectedPages?: number | undefined;
  actualPages?: number | undefined;
}

/** Byte-level verification of a final output. Measures the exact bytes the user downloads. */
export function verifyOutput(v: VerifyInput): Check[] {
  const checks: Check[] = [];
  const actualFormat = detectFormat(v.bytes);
  checks.push({
    id: 'format',
    pass: actualFormat === v.requestedFormat,
    label:
      actualFormat === v.requestedFormat
        ? `Format is ${v.requestedFormat.toUpperCase()} (checked from file bytes)`
        : `Requested ${v.requestedFormat.toUpperCase()} but the bytes are ${actualFormat ? actualFormat.toUpperCase() : 'unknown'}`,
  });
  if (v.limitBytes !== undefined) {
    const pass = v.bytes.length <= v.limitBytes;
    checks.push({
      id: 'size',
      pass,
      label: `${formatBytesExact(v.bytes.length)} ${pass ? '≤' : '>'} limit ${formatBytesExact(v.limitBytes)} (${formatBytes(v.bytes.length)})`,
    });
  }
  if (v.expected && v.actual) {
    const pass = v.expected.width === v.actual.width && v.expected.height === v.actual.height;
    checks.push({
      id: 'dimensions',
      pass,
      label: pass
        ? `Dimensions are exactly ${v.actual.width}×${v.actual.height}px`
        : `Expected ${v.expected.width}×${v.expected.height}px, got ${v.actual.width}×${v.actual.height}px`,
    });
  }
  if (v.expectedPages !== undefined && v.actualPages !== undefined) {
    const pass = v.expectedPages === v.actualPages;
    checks.push({
      id: 'pages',
      pass,
      label: pass ? `${v.actualPages} page(s), one per image` : `Expected ${v.expectedPages} pages, got ${v.actualPages}`,
    });
  }
  return checks;
}
