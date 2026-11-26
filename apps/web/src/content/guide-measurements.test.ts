import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MEASURED } from './guide-measurements';

const raw = JSON.parse(readFileSync(join(__dirname, '../../../../docs/benchmarks/guides.json'), 'utf8'));

describe('guide numbers match the measured benchmark file', () => {
  it('uses the same date', () => expect(raw.date.slice(0, 10)).toBe(MEASURED.date));
  for (const [key, m] of Object.entries(MEASURED)) {
    if (typeof m !== 'object') continue;
    it(key, () => {
      const r = raw[key];
      expect(r, `missing ${key} in guides.json`).toBeTruthy();
      expect(r.outputBytes).toBe(m.outputBytes);
      if ('inputBytes' in m) expect(r.inputBytes).toEqual(m.inputBytes);
      const text: string = r.after ?? r.meta;
      if ('width' in m) expect(text).toContain(`${m.width}×${m.height}px`);
      if ('quality' in m) expect(text).toContain(`quality ${m.quality}`);
      if ('pages' in m) expect(text).toContain(`${m.pages} pages`);
      if ('resolutionPercent' in m) expect(text).toContain(`${m.resolutionPercent}% resolution`);
    });
  }
});
