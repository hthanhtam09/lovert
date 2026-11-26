/* global console, process */
/* eslint-disable no-control-regex */
// Summarize a Playwright JSON report: node tests/qa/summarize.mjs <results.json> [--fail] [--matrix]
import { readFileSync } from 'node:fs';
const [file, ...flags] = process.argv.slice(2);
const d = JSON.parse(readFileSync(file, 'utf8'));
const rows = [];
const strip = (s) => (s ?? '').replace(/\x1b\[[0-9;]*m/g, '');
(function walk(s) {
  for (const sp of s.specs ?? [])
    for (const t of sp.tests) {
      const r = t.results.at(-1) ?? {};
      const id = sp.title.split(' ')[0];
      const verdict = t.annotations.filter((a) => a.type === 'verdict').map((a) => a.description).join(' ; ');
      const skip = t.annotations.filter((a) => a.type === 'skip').map((a) => a.description).join(' ; ');
      rows.push({ id, title: sp.title, project: t.projectName, status: r.status ?? 'notrun', ms: r.duration, verdict, skip, error: strip(r.errors?.[0]?.message).split('\n').slice(0, 6).join(' ⏎ ') });
    }
  for (const c of s.suites ?? []) walk(c);
})({ suites: d.suites });

if (flags.includes('--matrix')) {
  const projects = [...new Set(rows.map((r) => r.project))];
  const ids = [...new Set(rows.map((r) => r.id))];
  const map = { passed: 'PASS', failed: 'FAIL', timedOut: 'FAIL(timeout)', skipped: 'NOT RUN', interrupted: 'FAIL' };
  console.log(['case', ...projects].join('\t'));
  for (const id of ids) {
    console.log([id, ...projects.map((p) => {
      const r = rows.find((x) => x.id === id && x.project === p);
      if (!r) return '-';
      if (r.status === 'passed' && /^UNSUPPORTED/.test(r.verdict)) return 'UNSUPPORTED';
      return map[r.status] ?? r.status;
    })].join('\t'));
  }
  const tally = {};
  for (const r of rows) { const k = r.status === 'passed' && /^UNSUPPORTED/.test(r.verdict) ? 'UNSUPPORTED' : map[r.status] ?? r.status; tally[k] = (tally[k] ?? 0) + 1; }
  console.log('TOTAL', JSON.stringify(tally), 'of', rows.length);
} else {
  for (const r of rows) if (!flags.includes('--fail') || r.status !== 'passed') console.log(`${r.project}\t${r.id}\t${r.status}\t${r.ms}ms\t${r.verdict}\t${r.skip}\t${r.error}`);
}
