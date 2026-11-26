// Tool gate: fails unless every public tool has a contract and every required case ran and passed
// (or is a verified UNSUPPORTED / listed exception) on every required project.
// Usage: node scripts/tool-gate.mjs [--stage merge|release] [--unit reports/unit.json] [--e2e reports/e2e.json ...] [--registry-only]
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkRegistry, evaluate, fromPlaywright, fromVitest, markdown } from './tool-gate-lib.mjs';

const args = process.argv.slice(2);
const opt = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const stage = opt('--stage')[0] ?? 'merge';
const unitFiles = opt('--unit').length ? opt('--unit') : ['reports/unit.json'];
const e2eFiles = opt('--e2e').length ? opt('--e2e') : stage === 'release' ? ['reports/e2e.json', 'reports/e2e-release.json'] : ['reports/e2e.json'];

const { TOOLS, LIBRARY, INFO_PAGES } = await import('../apps/web/src/content/tools.ts');
const { CONTRACTS, PROJECTS } = await import('../tests/contracts/tool-contracts.ts');
const { EXCEPTIONS } = await import('../tests/contracts/exceptions.ts');

const APP = 'apps/web/src/app';
const routeDirs = readdirSync(APP).filter((d) => statSync(join(APP, d)).isDirectory() && existsSync(join(APP, d, 'page.tsx')));
const infoPaths = [...INFO_PAGES.map((p) => p.path)];

const registryErrors = checkRegistry({ tools: TOOLS, library: LIBRARY, routeDirs, infoPaths, contracts: CONTRACTS });
if (args.includes('--registry-only')) {
  if (registryErrors.length) {
    console.error(`Tool gate (registry): ${registryErrors.length} problem(s)\n` + registryErrors.map((e) => `  - ${e}`).join('\n'));
    process.exit(1);
  }
  console.log(`Tool gate (registry): OK — ${TOOLS.length} public tools, all with contracts.`);
  process.exit(0);
}

const results = [];
const missing = [];
for (const f of unitFiles) {
  if (existsSync(f)) results.push(...fromVitest(JSON.parse(readFileSync(f, 'utf8'))));
  else missing.push(f);
}
for (const f of e2eFiles) {
  if (existsSync(f)) results.push(...fromPlaywright(JSON.parse(readFileSync(f, 'utf8'))));
  else missing.push(f);
}

// Bind the verdict to the exact commit and run that produced the reports (CI env, else the local checkout).
import { execSync } from 'node:child_process';
const headSha = (() => {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null; // no commit yet (local work tree)
  }
})();
const provenance = {
  sha: process.env.GITHUB_SHA ?? headSha,
  dirty: process.env.GITHUB_SHA ? false : (() => {
    try {
      return execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().length > 0;
    } catch {
      return true;
    }
  })(),
  run: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}/${process.env.GITHUB_RUN_ATTEMPT ?? '1'}` : 'local',
  ref: process.env.GITHUB_REF ?? null,
  at: new Date().toISOString(),
};
if (process.env.GITHUB_SHA && headSha && headSha !== process.env.GITHUB_SHA) {
  console.error(`Tool gate: checkout ${headSha} differs from GITHUB_SHA ${process.env.GITHUB_SHA}`);
  process.exit(1);
}

const r = evaluate({ contracts: CONTRACTS, results, exceptions: EXCEPTIONS, projects: [...PROJECTS], stage });
const errors = [...registryErrors, ...missing.map((f) => `report ${f} is missing: its cases count as NOT RUN`), ...r.errors];
mkdirSync('reports', { recursive: true });
const md = `<!-- sha: ${provenance.sha ?? 'none (no commit)'} · dirty: ${provenance.dirty} · run: ${provenance.run} · ${provenance.at} -->\n` + markdown({ ...r, errors, stage });
writeFileSync(`reports/tool-gate-${stage}.md`, md);
writeFileSync(`reports/tool-gate-${stage}.json`, JSON.stringify({ stage, ...provenance, ok: errors.length === 0, errors, rows: r.rows, cases: r.cases }, null, 2));
console.log(md.split('\n').slice(0, 5 + r.rows.length).join('\n'));
if (errors.length) {
  console.error(`\nTool gate (${stage}) FAILED: ${errors.length} blocking item(s). First ones:\n` + errors.slice(0, 40).map((e) => `  - ${e}`).join('\n') + `\nFull list: reports/tool-gate-${stage}.md`);
  process.exit(1);
}
console.log(`\nTool gate (${stage}) PASSED.`);
