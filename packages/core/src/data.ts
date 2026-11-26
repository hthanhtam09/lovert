/**
 * CSV ⇄ JSON conversion. Pure logic on strings/bytes: runs in a worker, the main thread or a future API.
 * CSV follows RFC 4180 (comma separator, double-quoted fields, "" for a quote, CRLF or LF line ends).
 */
import { ErrorCodes, LovertError } from './errors.ts';
import { LIMITS } from './limits.ts';
import type { Check } from './result.ts';
import type { ErrorCode } from './errors.ts';

/** WHATWG text codecs: globals in every browser, worker and Node; typed here because core has no DOM lib. */
const codecs = globalThis as unknown as {
  TextEncoder: new () => { encode(s: string): Uint8Array };
  TextDecoder: new (label?: string, o?: { fatal?: boolean; ignoreBOM?: boolean }) => { decode(b: Uint8Array): string };
};
const utf8 = (s: string) => new codecs.TextEncoder().encode(s);

export type DataFormat = 'csv' | 'json';

export interface DataOutput {
  bytes: Uint8Array;
  format: DataFormat;
  rowCount: number;
  columns: string[];
  checks: Check[];
  /** Plain-English notes about how values were written (null, nested data, formulas, skipped lines). */
  notes: string[];
  /** First rows only, for the on-screen table. The download always has every row. */
  previewRows: string[][];
  /** Start of the output text for the on-screen preview. */
  previewText: string;
  previewTruncated: boolean;
}

export type DataResult = { status: 'ok'; output: DataOutput } | { status: 'error'; code: ErrorCode; message: string };

export const DATA_PREVIEW_ROWS = 50;
export const DATA_PREVIEW_CHARS = 20_000;
const MAX_LISTED_PROBLEMS = 5;

/** Decode UTF-8 strictly and drop a leading BOM. Other encodings are refused, not guessed. */
export function decodeUtf8(bytes: Uint8Array): { text: string; hadBom: boolean } {
  let text: string;
  try {
    text = new codecs.TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new LovertError(
      ErrorCodes.INVALID_ENCODING,
      'This file is not UTF-8 text. Save it as "CSV UTF-8" (or UTF-8 JSON) and choose it again.',
    );
  }
  const hadBom = text.charCodeAt(0) === 0xfeff;
  return { text: hadBom ? text.slice(1) : text, hadBom };
}

export interface CsvRecord {
  cells: string[];
  /** 1-based line where the record starts (a quoted field may span several lines). */
  line: number;
}

/**
 * Parse CSV text into records. Strict about quotes so a broken file is reported instead of silently
 * shifting columns: a quote inside an unquoted field, text after a closing quote and an unclosed quote are errors.
 */
export function parseCsv(text: string, maxRecords: number = LIMITS.maxDataRows + 1): CsvRecord[] {
  const records: CsvRecord[] = [];
  const n = text.length;
  let i = 0;
  let line = 1;
  let row: string[] = [];
  let rowLine = 1;
  const fail = (msg: string): never => {
    throw new LovertError(ErrorCodes.INVALID_CSV, msg);
  };
  const endRow = () => {
    records.push({ cells: row, line: rowLine });
    if (records.length > maxRecords)
      throw new LovertError(ErrorCodes.TOO_MANY_ROWS, `The file has more than ${(maxRecords - 1).toLocaleString('en-US')} rows. Split it into smaller files.`);
    row = [];
  };
  // Each iteration reads one field starting at i.
  for (;;) {
    if (i < n && text.charCodeAt(i) === 34 /* " */) {
      const startLine = line;
      let value = '';
      let seg = ++i;
      for (;;) {
        if (i >= n) fail(`A quoted field that starts on line ${startLine} is never closed. Check for a missing closing quote (").`);
        const c = text.charCodeAt(i);
        if (c === 34) {
          if (text.charCodeAt(i + 1) === 34) {
            value += text.slice(seg, i + 1);
            i += 2;
            seg = i;
            continue;
          }
          value += text.slice(seg, i);
          i++;
          break;
        }
        if (c === 10 || (c === 13 && text.charCodeAt(i + 1) !== 10)) line++;
        i++;
      }
      row.push(value);
      if (i < n) {
        const c = text.charCodeAt(i);
        if (c !== 44 && c !== 10 && c !== 13)
          fail(`Line ${line}: there is text right after a closing quote. A field that starts with a quote must end with one, followed by a comma or a new line.`);
      }
    } else {
      const start = i;
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 44 || c === 10 || c === 13) break;
        if (c === 34)
          fail(`Line ${line}: a quote (") appears inside a field that does not start with a quote. Wrap the whole field in quotes and write the inner quote twice ("").`);
        i++;
      }
      row.push(text.slice(start, i));
    }
    if (i >= n) {
      // A final line ending does not start another record.
      if (!(row.length === 1 && row[0] === '' && records.length > 0 && /[\r\n]$/.test(text))) endRow();
      else row = [];
      break;
    }
    const c = text.charCodeAt(i);
    if (c === 44) {
      i++;
      if (i >= n) {
        row.push('');
        endRow();
        break;
      }
      continue;
    }
    // Line end: CRLF, LF or CR.
    i += c === 13 && text.charCodeAt(i + 1) === 10 ? 2 : 1;
    endRow();
    line++;
    rowLine = line;
    if (i >= n) break;
  }
  return records;
}

const isBlank = (r: CsvRecord) => r.cells.length === 1 && r.cells[0] === '';

function list(problems: string[]): string {
  const shown = problems.slice(0, MAX_LISTED_PROBLEMS).join(' ');
  return problems.length > MAX_LISTED_PROBLEMS ? `${shown} (and ${problems.length - MAX_LISTED_PROBLEMS} more)` : shown;
}

/** Header problems: empty names and duplicates. Keys must be unique and non-empty to become JSON keys. */
export function checkHeader(header: string[]): void {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  header.forEach((h, k) => {
    if (h.trim() === '') problems.push(`Column ${k + 1} has an empty header.`);
    else if (seen.has(h)) problems.push(`Header "${h}" appears in columns ${seen.get(h)! + 1} and ${k + 1}.`);
    else seen.set(h, k);
  });
  if (problems.length) throw new LovertError(ErrorCodes.INVALID_CSV, `The header row needs a unique, non-empty name for every column. ${list(problems)}`);
}

function sizeCheck(bytes: Uint8Array): void {
  if (bytes.length === 0) throw new LovertError(ErrorCodes.EMPTY_FILE, 'The file is empty.');
  if (bytes.length > LIMITS.maxDataInputBytes)
    throw new LovertError(ErrorCodes.FILE_TOO_LARGE, `The file is larger than ${LIMITS.maxDataInputBytes / 1e6} MB.`);
}

function errorResult(e: unknown): DataResult {
  if (e instanceof LovertError) return { status: 'error', code: e.code, message: e.message };
  return { status: 'error', code: ErrorCodes.ENCODE_FAILED, message: 'Something went wrong while converting the file.' };
}

const preview = (full: string) => {
  const text = full.charCodeAt(0) === 0xfeff ? full.slice(1) : full; // the BOM is in the file, not in what people read
  return {
  previewText: text.length > DATA_PREVIEW_CHARS ? text.slice(0, DATA_PREVIEW_CHARS) : text,
  previewTruncated: text.length > DATA_PREVIEW_CHARS,
  };
};
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** CSV (UTF-8, header row) → JSON array of objects. Every value stays a string, so codes like "007" keep their zeros. */
export function csvToJson(bytes: Uint8Array): DataResult {
  try {
    sizeCheck(bytes);
    const { text, hadBom } = decodeUtf8(bytes);
    const all = parseCsv(text);
    const blank = all.filter(isBlank).length;
    const records = all.filter((r) => !isBlank(r));
    if (records.length === 0) throw new LovertError(ErrorCodes.INVALID_CSV, 'The file has no rows. The first line must be a header row.');
    const header = records[0]!.cells;
    checkHeader(header);
    const body = records.slice(1);
    if (body.length === 0) throw new LovertError(ErrorCodes.INVALID_CSV, 'The file has a header row but no data rows.');
    if (body.length * header.length > LIMITS.maxDataCells)
      throw new LovertError(ErrorCodes.TOO_MANY_ROWS, `The table has more than ${LIMITS.maxDataCells.toLocaleString('en-US')} cells. Split it into smaller files.`);
    const bad = body.filter((r) => r.cells.length !== header.length);
    if (bad.length)
      throw new LovertError(
        ErrorCodes.INVALID_CSV,
        `${plural(bad.length, 'row')} ${bad.length === 1 ? 'does' : 'do'} not have ${header.length} values like the header. ${list(bad.map((r) => `Line ${r.line} has ${r.cells.length}.`))} Check for a missing or extra comma, or a comma inside a value that is not in quotes.`,
      );
    // fromEntries defines own properties, so a "__proto__" header is kept as a normal key.
    const objects = body.map((r) => Object.fromEntries(header.map((h, k) => [h, r.cells[k]!])));
    const json = JSON.stringify(objects, null, 2) + '\n';
    const out = utf8(json);

    // Verify from the final bytes: decode, parse, compare every value.
    const back = JSON.parse(decodeUtf8(out).text) as Record<string, string>[];
    const same = Array.isArray(back) && back.length === body.length && back.every((o, k) => header.every((h, c) => o[h] === body[k]!.cells[c]) && Object.keys(o).length === header.length);
    const checks: Check[] = [
      { id: 'format', pass: same, label: same ? 'Output is valid JSON (parsed back from the file bytes)' : 'Output did not parse back to the same values' },
      { id: 'rows', pass: same, label: `${plural(body.length, 'row')} × ${plural(header.length, 'column')}, every value matches the CSV` },
      { id: 'encoding', pass: true, label: 'UTF-8 without BOM' },
    ];
    if (!same) return { status: 'error', code: ErrorCodes.ENCODE_FAILED, message: 'The output did not pass verification.' };
    const notes = ['Every value is a string, exactly as written in the CSV, so codes like 007 keep their leading zeros.'];
    if (hadBom) notes.push('The UTF-8 byte order mark (BOM) at the start of the file was removed.');
    if (blank) notes.push(`${plural(blank, 'empty line')} skipped.`);
    return {
      status: 'ok',
      output: {
        bytes: out, format: 'json', rowCount: body.length, columns: header, checks, notes,
        previewRows: body.slice(0, DATA_PREVIEW_ROWS).map((r) => r.cells), ...preview(json),
      },
    };
  } catch (e) {
    return errorResult(e);
  }
}

export interface JsonToCsvOptions {
  /** Start the file with a UTF-8 BOM so Excel reads accented text correctly. */
  bom: boolean;
  /** Prefix text cells that start with = + - @ (or tab/CR) with an apostrophe so spreadsheets do not run them as formulas. */
  protectFormulas: boolean;
}

/** Text a spreadsheet may treat as a formula when the CSV is opened. */
export const isFormulaLike = (s: string) => /^[=+\-@\t\r]/.test(s);

/** RFC 4180: quote a field that contains a comma, quote, CR or LF; double inner quotes. */
export function escapeCsvField(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function kindOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  if (typeof v === 'object') return 'an object';
  return `a ${typeof v}`;
}

/** JSON array of objects → CSV. Columns follow the order keys first appear; missing keys become empty cells. */
export function jsonToCsv(bytes: Uint8Array, opts: JsonToCsvOptions): DataResult {
  try {
    sizeCheck(bytes);
    const { text } = decodeUtf8(bytes);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new LovertError(ErrorCodes.INVALID_JSON, `This is not valid JSON. ${e instanceof Error ? e.message : ''}`.trim());
    }
    if (!Array.isArray(data))
      throw new LovertError(ErrorCodes.INVALID_JSON, `The JSON must be an array of objects, like [{"name": "An", "city": "Huế"}]. The top level is ${kindOf(data)}.`);
    if (data.length === 0) throw new LovertError(ErrorCodes.INVALID_JSON, 'The array is empty, so there are no rows to write.');
    if (data.length > LIMITS.maxDataRows)
      throw new LovertError(ErrorCodes.TOO_MANY_ROWS, `The array has more than ${LIMITS.maxDataRows.toLocaleString('en-US')} items. Split it into smaller files.`);
    const badItems: string[] = [];
    data.forEach((v, k) => {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) badItems.push(`Item ${k + 1} is ${kindOf(v)}.`);
    });
    if (badItems.length) throw new LovertError(ErrorCodes.INVALID_JSON, `Every item in the array must be an object (one row). ${list(badItems)}`);
    const rows = data as Record<string, unknown>[];

    const index = new Map<string, number>();
    for (const o of rows) for (const k of Object.keys(o)) if (!index.has(k)) index.set(k, index.size);
    const columns = [...index.keys()];
    if (columns.length === 0) throw new LovertError(ErrorCodes.INVALID_JSON, 'The objects have no keys, so there are no columns to write.');
    if (rows.length * columns.length > LIMITS.maxDataCells)
      throw new LovertError(ErrorCodes.TOO_MANY_ROWS, `The table has more than ${LIMITS.maxDataCells.toLocaleString('en-US')} cells. Split it into smaller files.`);

    let nulls = 0;
    let nested = 0;
    let missing = 0;
    let formulas = 0;
    const text2cell = (s: string) => {
      if (isFormulaLike(s)) {
        formulas++;
        if (opts.protectFormulas) return `'${s}`;
      }
      return s;
    };
    const cell = (o: Record<string, unknown>, k: string): string => {
      if (!Object.prototype.hasOwnProperty.call(o, k)) return (missing++, '');
      const v = o[k];
      if (v === null) return (nulls++, '');
      if (typeof v === 'string') return text2cell(v);
      if (typeof v === 'object') return (nested++, JSON.stringify(v));
      return String(v);
    };
    const header = columns.map(text2cell);
    const table = rows.map((o) => columns.map((k) => cell(o, k)));
    const csv = (opts.bom ? '﻿' : '') + [header, ...table].map((r) => r.map(escapeCsvField).join(',')).join('\r\n') + '\r\n';
    const out = utf8(csv);

    // Verify from the final bytes: decode, parse with the same strict parser, compare every cell.
    const backText = decodeUtf8(out).text;
    const back = parseCsv(backText);
    const expected = [header, ...table];
    const same = back.length === expected.length && back.every((r, k) => r.cells.length === columns.length && r.cells.every((c, j) => c === expected[k]![j]));
    if (!same) return { status: 'error', code: ErrorCodes.ENCODE_FAILED, message: 'The output did not pass verification.' };
    const checks: Check[] = [
      { id: 'format', pass: true, label: 'Output is valid CSV (parsed back from the file bytes)' },
      { id: 'rows', pass: true, label: `${plural(rows.length, 'row')} × ${plural(columns.length, 'column')} plus a header row, every cell matches` },
      { id: 'encoding', pass: true, label: opts.bom ? 'UTF-8 with BOM (Excel shows accents correctly)' : 'UTF-8 without BOM' },
    ];
    const notes: string[] = [];
    if (missing) notes.push(`${plural(missing, 'missing key')} written as empty cells.`);
    if (nulls) notes.push(`${plural(nulls, 'null value')} written as empty cells, the same as a missing key.`);
    if (nested) notes.push(`${plural(nested, 'nested object or array', 'nested objects or arrays')} written as JSON text inside the cell.`);
    if (formulas)
      notes.push(
        opts.protectFormulas
          ? `${plural(formulas, 'text cell')} started with = + - or @ and got an apostrophe (') in front, so spreadsheets show them as text.`
          : `${plural(formulas, 'text cell')} ${formulas === 1 ? 'starts' : 'start'} with = + - or @. A spreadsheet may run ${formulas === 1 ? 'it' : 'them'} as a formula. Turn on formula protection if the file comes from someone you don't trust.`,
      );
    return {
      status: 'ok',
      output: { bytes: out, format: 'csv', rowCount: rows.length, columns, checks, notes, previewRows: table.slice(0, DATA_PREVIEW_ROWS), ...preview(csv) },
    };
  } catch (e) {
    return errorResult(e);
  }
}
