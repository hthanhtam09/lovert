import { describe, expect, it } from 'vitest';
import { csvToJson, ErrorCodes, escapeCsvField, isAnimated, jsonToCsv, LIMITS, parseCsv, suggestionForOverLimit } from '../src/index.ts';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const ok = <T extends { status: string }>(r: T) => {
  if (r.status !== 'ok') throw new Error(JSON.stringify(r));
  return r as Extract<T, { status: 'ok' }>;
};

describe('parseCsv', () => {
  it('handles quotes, commas, doubled quotes and newlines inside fields', () => {
    const r = parseCsv('a,b\r\n"x, y","say ""hi"""\n"line1\nline2",z\n');
    expect(r.map((x) => x.cells)).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['line1\nline2', 'z']]);
    expect(r[2]!.line).toBe(3);
  });
  it('rejects broken quotes with a line number', () => {
    expect(() => parseCsv('a,b\n1,"open\n')).toThrow(/line 2 is never closed/);
    expect(() => parseCsv('a,b\n1,x"y\n')).toThrow(/Line 2: a quote/);
    expect(() => parseCsv('a\n"x"y\n')).toThrow(/after a closing quote/);
  });
  it('keeps a trailing empty field', () => {
    expect(parseCsv('a,b\n1,').map((x) => x.cells)).toEqual([['a', 'b'], ['1', '']]);
  });
});

describe('csvToJson', () => {
  it('UTF-8 with BOM, Vietnamese text, leading zeros kept as strings', () => {
    const r = ok(csvToJson(enc('﻿mã,tên,thành phố\n007,"Nguyễn, Văn A",Huế\n')));
    expect(JSON.parse(dec(r.output.bytes))).toEqual([{ 'mã': '007', 'tên': 'Nguyễn, Văn A', 'thành phố': 'Huế' }]);
    expect(r.output.notes.join(' ')).toMatch(/BOM/);
    expect(r.output.checks.every((c) => c.pass)).toBe(true);
  });
  it('reports duplicate and empty headers', () => {
    const r = csvToJson(enc('id,,id\n1,2,3\n'));
    expect(r.status === 'error' && r.code).toBe(ErrorCodes.INVALID_CSV);
    expect(r.status === 'error' && r.message).toMatch(/Column 2 has an empty header.*"id" appears in columns 1 and 3/);
  });
  it('reports rows with the wrong number of values', () => {
    const r = csvToJson(enc('a,b\n1,2\n1,2,3\n4\n'));
    expect(r.status === 'error' && r.message).toMatch(/2 rows do not have 2 values.*Line 3 has 3\. Line 4 has 1\./);
  });
  it('refuses non-UTF-8 text', () => {
    const r = csvToJson(Uint8Array.from([0x61, 0x0a, 0xe9, 0x0a]));
    expect(r.status === 'error' && r.code).toBe(ErrorCodes.INVALID_ENCODING);
  });
  it('keeps __proto__ as a normal key', () => {
    const r = ok(csvToJson(enc('__proto__,x\n1,2\n')));
    expect(dec(r.output.bytes)).toContain('"__proto__": "1"');
  });
  it('refuses too many rows', () => {
    const r = csvToJson(enc('a\n' + '1\n'.repeat(LIMITS.maxDataRows + 1)));
    expect(r.status === 'error' && r.code).toBe(ErrorCodes.TOO_MANY_ROWS);
  });
});

describe('jsonToCsv', () => {
  const opts = { bom: false, protectFormulas: false };
  it('columns in order of first appearance, missing keys empty, nested as JSON, null empty', () => {
    const r = ok(jsonToCsv(enc(JSON.stringify([{ name: 'An', tags: ['a', 'b'] }, { city: 'Đà Nẵng', name: null, meta: { x: 1 } }])), opts));
    expect(r.output.columns).toEqual(['name', 'tags', 'city', 'meta']);
    expect(dec(r.output.bytes)).toBe('name,tags,city,meta\r\nAn,"[""a"",""b""]",,\r\n,,Đà Nẵng,"{""x"":1}"\r\n');
    expect(r.output.notes.join(' ')).toMatch(/1 null value.*1 missing|missing.*null/s);
  });
  it('escapes commas, quotes and newlines', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('x\ny')).toBe('"x\ny"');
    expect(escapeCsvField('plain')).toBe('plain');
  });
  it('warns about formula-like text by default and protects it when asked', () => {
    const src = enc(JSON.stringify([{ f: '=SUM(A1)', n: -5, s: '-5', at: '@x' }]));
    const plain = ok(jsonToCsv(src, opts));
    expect(dec(plain.output.bytes)).toBe('f,n,s,at\r\n=SUM(A1),-5,-5,@x\r\n');
    expect(plain.output.notes.join(' ')).toMatch(/3 text cells start with/);
    const safe = ok(jsonToCsv(src, { bom: false, protectFormulas: true }));
    expect(dec(safe.output.bytes)).toBe("f,n,s,at\r\n'=SUM(A1),-5,'-5,'@x\r\n");
  });
  it('adds a BOM only when asked', () => {
    const r = ok(jsonToCsv(enc('[{"a":"ê"}]'), { bom: true, protectFormulas: false }));
    expect([...r.output.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
  it('rejects non-array, empty and non-object items', () => {
    expect(jsonToCsv(enc('{"a":1}'), opts)).toMatchObject({ status: 'error', code: ErrorCodes.INVALID_JSON });
    expect(jsonToCsv(enc('[]'), opts)).toMatchObject({ status: 'error', code: ErrorCodes.INVALID_JSON });
    const r = jsonToCsv(enc('[{"a":1}, 2, null]'), opts);
    expect(r.status === 'error' && r.message).toMatch(/Item 2 is a number\. Item 3 is null\./);
    expect(jsonToCsv(enc('[{"a":1}'), opts)).toMatchObject({ status: 'error', code: ErrorCodes.INVALID_JSON });
  });
  it('round-trips CSV → JSON → CSV', () => {
    const csv = 'id,note\r\n001,"a, ""b""\nc"\r\n';
    const json = ok(csvToJson(enc(csv)));
    const back = ok(jsonToCsv(json.output.bytes, opts));
    expect(dec(back.output.bytes)).toBe(csv);
  });
});

describe('isAnimated', () => {
  const chunk = (type: string) => [0, 0, 0, 0, ...[...type].map((c) => c.charCodeAt(0)), 0, 0, 0, 0];
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  it('detects APNG and animated WebP from headers', () => {
    expect(isAnimated(Uint8Array.from([...sig, ...chunk('acTL'), ...chunk('IDAT')]), 'png')).toBe(true);
    expect(isAnimated(Uint8Array.from([...sig, ...chunk('IDAT'), ...chunk('acTL')]), 'png')).toBe(false);
    const webp = (flags: number) => Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, flags, 0, 0, 0]);
    expect(isAnimated(webp(0x02), 'webp')).toBe(true);
    expect(isAnimated(webp(0x10), 'webp')).toBe(false);
  });
});

describe('suggestionForOverLimit', () => {
  const base = { sizeBytes: 200, limitBytes: 100, format: 'jpeg' };
  it('never suggests smaller dimensions when the size is fixed or resizing is already on', () => {
    expect(suggestionForOverLimit({ ...base, lossy: true, allowResize: false, fixedSize: true })).toMatch(/smaller exact size/);
    expect(suggestionForOverLimit({ ...base, lossy: true, allowResize: true })).not.toMatch(/Allow smaller/);
    expect(suggestionForOverLimit({ ...base, lossy: true, allowResize: false })).toMatch(/Allow smaller dimensions/);
  });
  it('does not suggest another format when the route fixes it', () => {
    expect(suggestionForOverLimit({ ...base, format: 'png', lossy: false, allowResize: false, formatLocked: true })).not.toMatch(/Switch the output/);
  });
});
