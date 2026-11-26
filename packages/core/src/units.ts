/**
 * Single unit policy for Lovert: decimal SI units.
 * 1 KB = 1,000 bytes, 1 MB = 1,000,000 bytes.
 * Display rounds UP so an over-limit file can never look like it fits.
 */
export const BYTES_PER_KB = 1000;
export const BYTES_PER_MB = 1000 * 1000;

export type SizeUnit = 'KB' | 'MB';

/**
 * Exact decimal → bytes. Parses the decimal text itself (no binary float multiply), so
 * "1.005" KB = 1,005 bytes. A fraction smaller than one byte is dropped (floor): the limit
 * never becomes larger than what the user typed. Accepts a number or the text typed in the UI
 * (digits, one optional "." and an optional exponent such as 1e2). Throws RangeError for
 * anything that is not a positive size of at least 1 byte.
 */
export function toBytes(value: number | string, unit: SizeUnit): number {
  const text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value.trim();
  const m = /^\+?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!m || (m[1] === '' && !m[2])) throw new RangeError('Size must be a positive number');
  const exp = Number(m[3] ?? 0) + (unit === 'KB' ? 3 : 6);
  let digits = (m[1] ?? '') + (m[2] ?? '');
  let point = (m[1] ?? '').length + exp; // position of the decimal point inside `digits`
  digits = digits.replace(/^0+/, (z) => ((point -= z.length), ''));
  if (point <= 0 || digits === '') throw new RangeError('Size must be at least 1 byte');
  const intPart = point >= digits.length ? digits + '0'.repeat(point - digits.length) : digits.slice(0, point);
  if (intPart.length > 15) throw new RangeError('Size is too large');
  const bytes = Number(intPart);
  if (!(bytes >= 1)) throw new RangeError('Size must be at least 1 byte');
  return bytes;
}

/** Round up to `decimals` places (never makes a size look smaller than it is). */
function ceilTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  // Subtract a tiny epsilon to avoid float noise turning 50.000000001 into 50.01.
  return Math.ceil(value * f - 1e-9) / f;
}

export function formatBytes(bytes: number): string {
  if (bytes < BYTES_PER_KB) return `${bytes} B`;
  // Rounding up 999,951–999,999 bytes would read "1000.0 KB": show those as MB instead.
  if (bytes < BYTES_PER_MB && ceilTo(bytes / BYTES_PER_KB, 1) < 1000) return `${ceilTo(bytes / BYTES_PER_KB, 1).toFixed(1)} KB`;
  return `${ceilTo(bytes / BYTES_PER_MB, 2).toFixed(2)} MB`;
}

export function formatBytesExact(bytes: number): string {
  return `${bytes.toLocaleString('en-US')} bytes`;
}

/** Coarse bucket for analytics — never the exact size. */
export function sizeBucket(bytes: number): string {
  const edges = [100e3, 500e3, 1e6, 5e6, 20e6];
  const labels = ['<100KB', '100-500KB', '500KB-1MB', '1-5MB', '5-20MB'];
  for (let i = 0; i < edges.length; i++) if (bytes < edges[i]!) return labels[i]!;
  return '>=20MB';
}
