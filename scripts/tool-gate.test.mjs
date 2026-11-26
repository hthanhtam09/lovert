import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkRegistry, evaluate, fromPlaywright, fromVitest, tagsOf } from './tool-gate-lib.mjs';
import { TOOLS, LIBRARY, INFO_PAGES } from '../apps/web/src/content/tools.ts';
import { CONTRACTS, PROJECTS } from '../tests/contracts/tool-contracts.ts';

const P = ['chromium', 'webkit'];
const contract = (over = {}) => ({
  slug: 'png-to-x', status: 'public', inputs: ['PNG'], outputs: ['X'], limits: [{ name: 'f', value: 1, unit: 'bytes' }], capabilities: ['webp-encode'],
  cases: [
    { id: 'flow', layer: 'e2e', stage: 'merge', what: '', unsupported: ['webp-encode'] },
    { id: 'logic', layer: 'unit', stage: 'merge', what: '' },
    { id: 'big', layer: 'e2e', stage: 'release', what: '' },
  ],
  ...over,
});
const pass = (title, project = 'chromium', extra = {}) => ({ layer: project === 'vitest' ? 'unit' : 'e2e', project, title, status: 'passed', unsupported: [], ...extra });
const allPass = () => [pass('a [png-to-x:flow]'), pass('a [png-to-x:flow]', 'webkit'), pass('b [png-to-x:logic]', 'vitest')];
const run = (results, o = {}) => evaluate({ contracts: [contract(o.contract)], results, exceptions: o.exceptions ?? [], projects: P, stage: o.stage ?? 'merge' });

describe('tool gate: results', () => {
  it('passes when every required case passed on every project', () => {
    const r = run(allPass());
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ required: 3, pass: 3, fail: 0, notRun: 0 });
  });
  it('a case declared in the contract but never run is NOT RUN and blocks', () => {
    const r = run([pass('a [png-to-x:flow]'), pass('b [png-to-x:logic]', 'vitest')]);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/NOT RUN png-to-x:flow on webkit/);
  });
  it('a failing test blocks, tagged or not', () => {
    expect(run([...allPass(), { ...pass('a [png-to-x:flow]', 'webkit'), status: 'failed' }]).errors.join()).toMatch(/FAIL png-to-x:flow on webkit/);
    expect(run([...allPass(), { ...pass('untagged helper test'), status: 'failed' }]).ok).toBe(false);
  });
  it('a skipped required case is NOT RUN; a skipped test blocks unless listed as an exception', () => {
    const results = [pass('a [png-to-x:flow]'), { ...pass('a [png-to-x:flow]', 'webkit'), status: 'skipped' }, pass('b [png-to-x:logic]', 'vitest')];
    expect(run(results).ok).toBe(false);
    const exceptions = [{ slug: 'png-to-x', case: 'flow', project: 'webkit', status: 'skipped', reason: 'tracked' }];
    expect(run(results, { exceptions }).errors).toEqual([]);
  });
  it('flaky (passed only on retry) blocks', () => {
    expect(run([...allPass().slice(1), { ...pass('a [png-to-x:flow]'), status: 'flaky' }]).ok).toBe(false);
  });
  it('UNSUPPORTED counts only for a declared capability with a reason', () => {
    const u = (capability, reason) => [pass('a [png-to-x:flow]', 'webkit', { unsupported: [{ capability, reason }] }), pass('a [png-to-x:flow]'), pass('b [png-to-x:logic]', 'vitest')];
    const ok = run(u('webp-encode', 'probe returned PNG; UI disabled the action'));
    expect(ok.errors).toEqual([]);
    expect(ok.rows[0].unsupported).toBe(1);
    expect(run(u('webp-encode', '')).ok).toBe(false);
    expect(run(u('heic-decode', 'x')).ok).toBe(false);
    // A case without an allowed capability can never be UNSUPPORTED.
    const results = [pass('b [png-to-x:logic]', 'vitest', { unsupported: [{ capability: 'webp-encode', reason: 'x' }] }), pass('a [png-to-x:flow]'), pass('a [png-to-x:flow]', 'webkit')];
    expect(run(results).errors.join()).toMatch(/not allowed/);
  });
  it('a typo in a case tag blocks', () => {
    expect(run([...allPass(), pass('c [png-to-x:flwo]')]).errors.join()).toMatch(/unknown case tag \[png-to-x:flwo\]/);
  });
  it('release stage also requires release cases', () => {
    expect(run(allPass(), { stage: 'release' }).errors.join()).toMatch(/NOT RUN png-to-x:big/);
    expect(run([...allPass(), pass('z [png-to-x:big]'), pass('z [png-to-x:big]', 'webkit')], { stage: 'release' }).errors).toEqual([]);
  });
});

describe('tool gate: registry', () => {
  const base = {
    tools: [{ slug: 'png-to-x', path: '/png-to-x' }],
    library: [{ title: 'PNG to X', path: '/png-to-x' }],
    routeDirs: ['png-to-x', 'help'],
    infoPaths: ['/help'],
    contracts: [contract()],
  };
  it('accepts a consistent registry', () => expect(checkRegistry(base)).toEqual([]));
  it('a public tool without a contract blocks', () => expect(checkRegistry({ ...base, contracts: [] }).join()).toMatch(/has no test contract/));
  it('a route folder outside the catalogue blocks (cannot dodge the gate by removing the entry)', () => {
    expect(checkRegistry({ ...base, tools: [], library: [], contracts: [] }).join()).toMatch(/route \/png-to-x exists .* not in the tool catalogue/);
  });
  it('an "Available" library link to a non-catalogued path blocks', () => {
    expect(checkRegistry({ ...base, library: [{ title: 'Sneaky', path: '/sneaky' }] }).join()).toMatch(/links to \/sneaky/);
  });
  it('a public tool whose contract says planned blocks', () => {
    expect(checkRegistry({ ...base, contracts: [contract({ status: 'planned' })] }).join()).toMatch(/says "planned"/);
  });
  it('a planned contract with a route folder blocks', () => {
    expect(checkRegistry({ ...base, tools: [], library: [], routeDirs: ['png-to-x'], contracts: [contract({ status: 'planned' })] }).join()).toMatch(/route \/png-to-x|planned tool/);
  });
  it('a contract without inputs/limits/flow case blocks', () => {
    expect(checkRegistry({ ...base, contracts: [contract({ inputs: [], limits: [], cases: [{ id: 'logic', layer: 'unit', stage: 'merge', what: '' }] })] }).length).toBeGreaterThanOrEqual(3);
  });
  it('the real catalogue, routes and contracts agree', () => {
    const APP = 'apps/web/src/app';
    const routeDirs = readdirSync(APP).filter((d) => statSync(join(APP, d)).isDirectory() && existsSync(join(APP, d, 'page.tsx')));
    expect(checkRegistry({ tools: TOOLS, library: LIBRARY, routeDirs, infoPaths: INFO_PAGES.map((p) => p.path), contracts: CONTRACTS })).toEqual([]);
    expect(PROJECTS).toEqual(['chromium', 'firefox', 'webkit', 'mobile-chromium', 'mobile-webkit']);
  });
});

describe('tool gate: report parsing', () => {
  it('reads tags, Playwright and Vitest reports', () => {
    expect(tagsOf('x [a-b:c] [d:e-f]')).toEqual([{ slug: 'a-b', case: 'c' }, { slug: 'd', case: 'e-f' }]);
    const pw = { suites: [{ title: 'f.spec.ts', specs: [], suites: [{ title: 'd', specs: [{ title: 't [a:b]', tests: [
      { projectName: 'webkit', status: 'expected', annotations: [{ type: 'unsupported', description: 'webp-encode: no encoder' }], results: [{ status: 'passed' }] },
      { projectName: 'chromium', status: 'flaky', results: [{ status: 'failed' }, { status: 'passed' }] },
      { projectName: 'firefox', status: 'skipped', results: [] },
    ] }] }] }] };
    expect(fromPlaywright(pw).map((r) => [r.project, r.status, r.unsupported.length])).toEqual([['webkit', 'passed', 1], ['chromium', 'flaky', 0], ['firefox', 'skipped', 0]]);
    expect(fromPlaywright(pw)[0].unsupported[0]).toEqual({ capability: 'webp-encode', reason: 'no encoder' });
    const vt = { testResults: [{ assertionResults: [{ fullName: 'x [a:b]', status: 'passed' }, { fullName: 'y', status: 'pending' }] }] };
    expect(fromVitest(vt).map((r) => r.status)).toEqual(['passed', 'skipped']);
  });
});
