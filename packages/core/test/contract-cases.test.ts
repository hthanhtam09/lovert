/**
 * Unit cases required by tests/contracts/tool-contracts.ts. Each title carries its [slug:case] tag;
 * the tool gate reads these from the Vitest JSON report.
 */
import { describe, expect, it } from 'vitest';
import {
  csvToJson, ErrorCodes, jsonToCsv, LIMITS, LovertError, pdfAdmission, toBytes, validateDimensions, validateImageBytes, verifyOutput, type DataResult,
} from '../src/index.ts';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
function ok(r: DataResult) {
  if (r.status !== 'ok') throw new Error(`${r.code}: ${r.message}`);
  return r.output;
}
const err = (r: DataResult) => (r.status === 'error' ? r : (() => { throw new Error('expected an error'); })());
const json = (csv: string) => JSON.parse(dec(ok(csvToJson(enc(csv))).bytes));
const raw = { bom: false, protectFormulas: false };
const csv = (v: unknown, o = raw) => dec(ok(jsonToCsv(enc(JSON.stringify(v)), o)).bytes);

/** A JPEG-looking byte array of exactly n bytes (only the magic matters to the size check). */
const jpegOf = (n: number) => {
  const b = new Uint8Array(n);
  b.set([0xff, 0xd8, 0xff]);
  return b;
};

describe('compress-image', () => {
  it('[compress-image:limit-bytes] 100 KB: 99,999 and 100,000 bytes pass, 100,001 fails', () => {
    const limit = toBytes('100', 'KB');
    expect(limit).toBe(100_000);
    const size = (n: number) => verifyOutput({ bytes: jpegOf(n), requestedFormat: 'jpeg', limitBytes: limit }).find((c) => c.id === 'size')!;
    expect(size(99_999).pass).toBe(true);
    expect(size(100_000).pass).toBe(true);
    expect(size(100_001).pass).toBe(false);
    expect(size(100_001).label).toContain('100,001 bytes > limit 100,000 bytes');
  });
  it('[compress-image:input-bytes] 49,999,999 / 50,000,000 accepted, 50,000,001 refused', () => {
    // Bytes without a readable header: the size rule is decided before anything else.
    const sized = (n: number) => () => validateImageBytes(jpegOf(n));
    expect(sized(LIMITS.maxInputBytes - 1)).not.toThrow();
    expect(sized(LIMITS.maxInputBytes)).not.toThrow();
    expect(sized(LIMITS.maxInputBytes + 1)).toThrow(expect.objectContaining({ code: ErrorCodes.FILE_TOO_LARGE }));
  });
  it('[compress-image:pixel-limit-boundary] 50 MP and 16,384 px per side are inclusive limits', () => {
    expect(() => validateDimensions(8000, 6249)).not.toThrow();
    expect(() => validateDimensions(8000, 6250)).not.toThrow(); // exactly 50,000,000
    expect(() => validateDimensions(8000, 6251)).toThrow(LovertError);
    expect(() => validateDimensions(16_384, 100)).not.toThrow();
    expect(() => validateDimensions(16_385, 100)).toThrow(expect.objectContaining({ code: ErrorCodes.TOO_MANY_PIXELS }));
  });
});

describe('images-to-pdf', () => {
  it('[images-to-pdf:count-limit-boundary] 49 and 50 images accepted, the 51st refused', () => {
    expect(pdfAdmission({ count: 48, totalBytes: 0 }, 1)).toBe('ok'); // becomes the 49th
    expect(pdfAdmission({ count: 49, totalBytes: 0 }, 1)).toBe('ok'); // becomes the 50th
    expect(pdfAdmission({ count: 50, totalBytes: 0 }, 1)).toBe('too_many'); // would be the 51st
  });
  it('[images-to-pdf:total-limit] 199,999,999 / 200,000,000 bytes accepted, 200,000,001 refused', () => {
    const max = LIMITS.maxPdfTotalInputBytes;
    expect(max).toBe(200_000_000);
    expect(pdfAdmission({ count: 1, totalBytes: max - 2 }, 1)).toBe('ok');
    expect(pdfAdmission({ count: 1, totalBytes: max - 1 }, 1)).toBe('ok');
    expect(pdfAdmission({ count: 1, totalBytes: max }, 1)).toBe('too_large');
  });
});

describe('csv-to-json', () => {
  it('[csv-to-json:bom] a UTF-8 BOM is removed and noted', () => {
    const out = ok(csvToJson(enc('﻿a\n1\n')));
    expect(JSON.parse(dec(out.bytes))).toEqual([{ a: '1' }]);
    expect(out.notes.join(' ')).toMatch(/BOM/);
  });
  it('[csv-to-json:no-bom] UTF-8 without BOM', () => expect(json('a\n1\n')).toEqual([{ a: '1' }]));
  it('[csv-to-json:vietnamese] Vietnamese text kept exactly (keys and values)', () => {
    expect(json('họ tên,thành phố\nNguyễn Thị Ánh,Đà Nẵng\n')).toEqual([{ 'họ tên': 'Nguyễn Thị Ánh', 'thành phố': 'Đà Nẵng' }]);
  });
  it('[csv-to-json:lf] LF line ends', () => expect(json('a,b\n1,2\n3,4\n')).toHaveLength(2));
  it('[csv-to-json:crlf] CRLF line ends leave no \\r in values', () => expect(json('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }]));
  it('[csv-to-json:quoted-comma] comma inside quotes', () => expect(json('a,b\n"x, y",2\n')).toEqual([{ a: 'x, y', b: '2' }]));
  it('[csv-to-json:escaped-quote] "" inside quotes', () => expect(json('a\n"say ""hi"""\n')).toEqual([{ a: 'say "hi"' }]));
  it('[csv-to-json:newline-in-cell] line break inside quotes (LF and CRLF)', () => {
    expect(json('a,b\n"l1\nl2",x\n')).toEqual([{ a: 'l1\nl2', b: 'x' }]);
    expect(json('a,b\r\n"l1\r\nl2",x\r\n')).toEqual([{ a: 'l1\r\nl2', b: 'x' }]);
  });
  it('[csv-to-json:empty-last-column] empty last column is ""', () => expect(json('a,b\n1,\n')).toEqual([{ a: '1', b: '' }]));
  it('[csv-to-json:final-newline] last line with and without a newline give the same rows', () => {
    expect(json('a\n1\n2')).toEqual(json('a\n1\n2\n'));
    expect(json('a\n1\n2')).toHaveLength(2);
  });
  it('[csv-to-json:strings-kept] 00123, false, 1e3 and empty cells stay strings', () => {
    expect(json('a,b,c,d\n00123,false,1e3,\n')).toEqual([{ a: '00123', b: 'false', c: '1e3', d: '' }]);
  });
  it('[csv-to-json:proto-key] __proto__ is a data key, not a prototype', () => {
    const [row] = json('__proto__,constructor\n1,2\n');
    expect(Object.keys(row)).toEqual(['__proto__', 'constructor']);
    expect(row.__proto__).toBe('1');
  });
  it('[csv-to-json:header-empty] empty header reported with its column', () => {
    const e = err(csvToJson(enc('a, ,c\n1,2,3\n')));
    expect(e.code).toBe(ErrorCodes.INVALID_CSV);
    expect(e.message).toContain('Column 2 has an empty header');
  });
  it('[csv-to-json:header-duplicate] duplicate header reported with both columns', () => {
    expect(err(csvToJson(enc('id,x,id\n1,2,3\n'))).message).toContain('Header "id" appears in columns 1 and 3');
  });
  it('[csv-to-json:row-short] row with too few values reported by line', () => {
    expect(err(csvToJson(enc('a,b,c\n1,2,3\n4,5\n'))).message).toMatch(/1 row does not have 3 values.*Line 3 has 2/);
  });
  it('[csv-to-json:row-long] row with too many values reported by line', () => {
    expect(err(csvToJson(enc('a,b\n1,2,3\n'))).message).toMatch(/Line 2 has 3/);
  });
  it('[csv-to-json:unclosed-quote] unclosed quote reported with its start line', () => {
    const e = err(csvToJson(enc('a,b\n1,2\n3,"open\n')));
    expect(e.code).toBe(ErrorCodes.INVALID_CSV);
    expect(e.message).toMatch(/starts on line 3 is never closed/);
  });
  it('[csv-to-json:blank-lines] policy: empty lines are skipped and counted', () => {
    const out = ok(csvToJson(enc('a\n\n1\n\n2\n')));
    expect(JSON.parse(dec(out.bytes))).toEqual([{ a: '1' }, { a: '2' }]);
    expect(out.notes.join(' ')).toContain('2 empty lines skipped');
  });
  it('[csv-to-json:invalid-utf8] policy: non-UTF-8 input is refused, never guessed', () => {
    // "café" in Windows-1252.
    expect(err(csvToJson(Uint8Array.from([0x61, 0x0a, 0x63, 0x61, 0x66, 0xe9, 0x0a]))).code).toBe(ErrorCodes.INVALID_ENCODING);
  });
  it('[csv-to-json:limits] rows 200,000 ok / 200,001 refused; bytes and cells limits', () => {
    const rows = (n: number) => enc('a\n' + '1\n'.repeat(n));
    expect(ok(csvToJson(rows(LIMITS.maxDataRows))).rowCount).toBe(200_000);
    expect(err(csvToJson(rows(LIMITS.maxDataRows + 1))).code).toBe(ErrorCodes.TOO_MANY_ROWS);
    const sized = (n: number) => {
      const b = new Uint8Array(n).fill(0x31); // "111…" one header, no rows
      b[0] = 0x61;
      b[1] = 0x0a;
      return b;
    };
    const atLimit = csvToJson(sized(LIMITS.maxDataInputBytes));
    expect(atLimit.status).toBe('ok'); // exactly 20,000,000 bytes: accepted (one long value)
    expect(err(csvToJson(sized(LIMITS.maxDataInputBytes + 1))).code).toBe(ErrorCodes.FILE_TOO_LARGE);
    // 21 columns × 200,000 rows = 4,200,000 cells > 4,000,000.
    const wide = enc(Array.from({ length: 21 }, (_, i) => `c${i}`).join(',') + '\n' + `${',' .repeat(20)}\n`.repeat(200_000));
    expect(err(csvToJson(wide)).code).toBe(ErrorCodes.TOO_MANY_ROWS);
  });
});

describe('json-to-csv', () => {
  it('[json-to-csv:later-keys] keys first seen in later rows become later columns', () => {
    expect(csv([{ a: 1 }, { b: 2, a: 3 }, { c: 4 }])).toBe('a,b,c\r\n1,,\r\n3,2,\r\n,,4\r\n');
  });
  it('[json-to-csv:missing-key] missing key → empty cell, counted', () => {
    const out = ok(jsonToCsv(enc('[{"a":"x","b":"y"},{"a":"z"}]'), raw));
    expect(dec(out.bytes)).toBe('a,b\r\nx,y\r\nz,\r\n');
    expect(out.notes.join(' ')).toContain('1 missing key');
  });
  it('[json-to-csv:null] null → empty cell (documented), counted', () => {
    const out = ok(jsonToCsv(enc('[{"a":null,"b":"x"}]'), raw));
    expect(dec(out.bytes)).toBe('a,b\r\n,x\r\n');
    expect(out.notes.join(' ')).toContain('1 null value');
  });
  it('[json-to-csv:boolean] true/false as text', () => expect(csv([{ t: true, f: false }])).toBe('t,f\r\ntrue,false\r\n'));
  it('[json-to-csv:number] numbers as in JSON', () => expect(csv([{ a: 0, b: -5, c: 3.14, d: 1e21 }])).toBe('a,b,c,d\r\n0,-5,3.14,1e+21\r\n'));
  it('[json-to-csv:nested] objects/arrays as JSON text in the cell', () => {
    expect(csv([{ o: { x: 1 }, l: [1, 'a'] }])).toBe('o,l\r\n"{""x"":1}","[1,""a""]"\r\n');
  });
  it('[json-to-csv:escape] comma, quote, CR/LF escaped per RFC 4180', () => {
    expect(csv([{ a: 'x,y', b: 'say "hi"', c: 'l1\nl2', d: 'r\r', e: ' sp ' }])).toBe('a,b,c,d,e\r\n"x,y","say ""hi""","l1\nl2","r\r", sp \r\n');
  });
  it('[json-to-csv:broken-json] broken JSON refused', () => expect(err(jsonToCsv(enc('[{"a":1}'), raw)).code).toBe(ErrorCodes.INVALID_JSON));
  it('[json-to-csv:root-type] root that is not an array refused', () => {
    expect(err(jsonToCsv(enc('{"a":1}'), raw)).message).toContain('The top level is an object');
    expect(err(jsonToCsv(enc('"x"'), raw)).message).toContain('a string');
  });
  it('[json-to-csv:item-type] items that are not objects refused with positions', () => {
    expect(err(jsonToCsv(enc('[{"a":1},[1],null,3]'), raw)).message).toMatch(/Item 2 is an array\. Item 3 is null\. Item 4 is a number\./);
  });
  it('[json-to-csv:empty-array] policy: empty array refused', () => expect(err(jsonToCsv(enc('[]'), raw)).message).toContain('empty'));
  it('[json-to-csv:limits] items 200,000 ok / 200,001 refused; cells over 4,000,000 refused', () => {
    const items = (n: number) => enc(`[${Array(n).fill('{"a":"1"}').join(',')}]`);
    expect(ok(jsonToCsv(items(LIMITS.maxDataRows), raw)).rowCount).toBe(200_000);
    expect(err(jsonToCsv(items(LIMITS.maxDataRows + 1), raw)).code).toBe(ErrorCodes.TOO_MANY_ROWS);
    const keys = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, '']));
    // 21 columns (from the first object) × 200,000 rows = 4,200,000 cells; missing keys still count as cells.
    expect(err(jsonToCsv(enc(JSON.stringify([keys, ...Array(199_999).fill({})])), raw)).code).toBe(ErrorCodes.TOO_MANY_ROWS);
  });
  it('[json-to-csv:formula-raw] default keeps = + - @ text exactly and counts it', () => {
    const out = ok(jsonToCsv(enc(JSON.stringify([{ a: '=1+1', b: '+x', c: '-y', d: '@z', n: -5 }])), raw));
    expect(dec(out.bytes)).toBe('a,b,c,d,n\r\n=1+1,+x,-y,@z,-5\r\n');
    expect(out.notes.join(' ')).toContain('4 text cells start with');
  });
  it('[json-to-csv:formula-protected] protection prefixes text only; numbers unchanged', () => {
    const out = ok(jsonToCsv(enc(JSON.stringify([{ a: '=1+1', n: -5, s: '-5', ok: 'plain' }])), { bom: false, protectFormulas: true }));
    expect(dec(out.bytes)).toBe("a,n,s,ok\r\n'=1+1,-5,'-5,plain\r\n");
  });
  it('[json-to-csv:round-trip] string-only data with one schema: CSV → JSON → CSV is identical', () => {
    const src = 'mã,ghi chú\r\n00123,"a, ""b""\nc"\r\n,Huế\r\n';
    const back = ok(jsonToCsv(ok(csvToJson(enc(src))).bytes, raw));
    expect(dec(back.bytes)).toBe(src);
  });
  it('[json-to-csv:non-round-trip] documented losses: types become strings; null and missing both become ""', () => {
    const viaCsv = JSON.parse(dec(ok(csvToJson(ok(jsonToCsv(enc('[{"n":5,"b":true,"z":null},{"n":1}]'), raw)).bytes)).bytes));
    expect(viaCsv).toEqual([{ n: '5', b: 'true', z: '' }, { n: '1', b: '', z: '' }]);
  });
  it('[json-to-csv:bom] BOM only when asked', () => {
    expect([...ok(jsonToCsv(enc('[{"a":"ê"}]'), { bom: true, protectFormulas: false })).bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(ok(jsonToCsv(enc('[{"a":"ê"}]'), raw)).bytes[0]).toBe(0x61);
  });
});
