// Pure logic of the tool gate (no file access), so the gate itself can be unit-tested.
// Inputs: catalogue (tools + library), route folders, contracts, exceptions, normalised test results.

export const TAG = /\[([a-z0-9-]+):([a-z0-9-]+)\]/g;

/** Every [slug:case] tag in a test title. */
export function tagsOf(title) {
  return [...title.matchAll(TAG)].map((m) => ({ slug: m[1], case: m[2] }));
}

/**
 * Normalise a Playwright JSON report into flat results.
 * status: passed | failed | skipped | flaky. `unsupported`: [{ capability, reason }] from test annotations.
 */
export function fromPlaywright(report) {
  const out = [];
  const walk = (suite, prefix) => {
    const here = suite.title ? [...prefix, suite.title] : prefix;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        // Playwright copies annotations to the test and to each result: dedupe.
        const seen = new Set();
        const anns = [...(t.annotations ?? []), ...(t.results ?? []).flatMap((r) => r.annotations ?? [])].filter((a) => {
          const k = `${a.type}\u0000${a.description ?? ''}`;
          return seen.has(k) ? false : (seen.add(k), true);
        });
        const unsupported = anns
          .filter((a) => a.type === 'unsupported')
          .map((a) => {
            const [capability, ...rest] = String(a.description ?? '').split(':');
            return { capability: capability.trim(), reason: rest.join(':').trim() };
          });
        const last = t.results?.[t.results.length - 1];
        const status =
          t.status === 'skipped' ? 'skipped' : t.status === 'flaky' ? 'flaky' : t.status === 'expected' && last?.status === 'passed' ? 'passed' : t.status === 'expected' ? 'passed' : 'failed';
        out.push({ layer: 'e2e', project: t.projectName, title: [...here, spec.title].join(' › '), status, unsupported });
      }
    }
    for (const s of suite.suites ?? []) walk(s, here);
  };
  for (const s of report.suites ?? []) walk(s, []);
  return out;
}

/** Normalise a Vitest JSON report. */
export function fromVitest(report) {
  return (report.testResults ?? []).flatMap((file) =>
    (file.assertionResults ?? []).map((a) => ({
      layer: 'unit',
      project: 'vitest',
      title: a.fullName ?? a.title,
      status: a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped',
      unsupported: [],
    })),
  );
}

/**
 * Registry check: the catalogue, the route folders and the contracts must agree.
 * - every route folder that is not an info page is a catalogued tool (a real route cannot hide by leaving the catalogue)
 * - every linked library card points to a catalogued tool (no "Available" link around the gate)
 * - every catalogued tool has a public contract with cases; planned contracts have no route, no card link
 */
export function checkRegistry({ tools, library, routeDirs, infoPaths, contracts }) {
  const errors = [];
  const toolPaths = new Map(tools.map((t) => [t.path, t.slug]));
  const bySlug = new Map(contracts.map((c) => [c.slug, c]));
  const dup = contracts.map((c) => c.slug).filter((s, i, a) => a.indexOf(s) !== i);
  for (const d of new Set(dup)) errors.push(`contract for "${d}" is declared more than once`);
  for (const dir of routeDirs) {
    const path = `/${dir}`;
    if (infoPaths.includes(path)) continue;
    if (!toolPaths.has(path)) errors.push(`route ${path} exists in apps/web/src/app but is not in the tool catalogue (TOOLS); it would ship without a contract`);
  }
  for (const item of library) {
    if (item.path && !toolPaths.has(item.path)) errors.push(`library card "${item.title}" links to ${item.path}, which is not a catalogued tool`);
  }
  for (const t of tools) {
    const c = bySlug.get(t.slug);
    if (!c) errors.push(`tool "${t.slug}" has no test contract (tests/contracts/tool-contracts.ts)`);
    else if (c.status !== 'public') errors.push(`tool "${t.slug}" is public (catalogue entry and route) but its contract says "${c.status}"`);
    else {
      if (!c.cases.length) errors.push(`tool "${t.slug}" contract has no cases`);
      if (!c.inputs.length || !c.outputs.length) errors.push(`tool "${t.slug}" contract must declare inputs and outputs`);
      if (!c.limits.length) errors.push(`tool "${t.slug}" contract must declare its limits`);
      if (!c.cases.some((k) => k.layer === 'e2e' && k.id === 'flow')) errors.push(`tool "${t.slug}" contract lacks the required e2e "flow" case`);
      const ids = c.cases.map((k) => k.id);
      for (const d of new Set(ids.filter((s, i, a) => a.indexOf(s) !== i))) errors.push(`tool "${t.slug}" declares case "${d}" twice`);
      for (const k of c.cases) for (const cap of k.unsupported ?? []) if (!c.capabilities.includes(cap)) errors.push(`${t.slug}:${k.id} may be unsupported for "${cap}", which the contract does not list as a capability`);
    }
  }
  for (const c of contracts) {
    if (c.status === 'planned' && routeDirs.includes(c.slug)) errors.push(`planned tool "${c.slug}" has a route folder; make it public with a full contract`);
  }
  return errors;
}

/**
 * Evaluate results against the contracts.
 * Returns { ok, errors, rows, cases } where rows is the per-tool summary table.
 */
export function evaluate({ contracts, results, exceptions, projects, stage }) {
  const errors = [];
  const stages = stage === 'release' ? ['merge', 'release'] : ['merge'];
  const known = new Map(contracts.filter((c) => c.status === 'public').map((c) => [c.slug, new Map(c.cases.map((k) => [k.id, k]))]));
  const exc = (slug, id, project, status) => exceptions.find((e) => e.slug === slug && e.case === id && e.project === project && e.status === status);

  // 1) Every failing/flaky/skipped test, tagged or not, fails the gate unless excepted.
  for (const r of results) {
    if (r.status === 'passed') continue;
    const tags = tagsOf(r.title);
    const excused = tags.length > 0 && tags.every((t) => exc(t.slug, t.case, r.project, r.status));
    if (!excused) errors.push(`${r.status.toUpperCase()}: [${r.project}] ${r.title}`);
  }
  // 2) Tags must name a declared case (catches typos that would silently not count).
  for (const r of results)
    for (const t of tagsOf(r.title))
      if (!known.get(t.slug)?.has(t.case)) errors.push(`unknown case tag [${t.slug}:${t.case}] in "${r.title}" (not in a public contract)`);

  // 3) Each required case: status per required project (e2e) or per run (unit).
  const cases = [];
  const rows = [];
  for (const c of contracts.filter((x) => x.status === 'public')) {
    const row = { slug: c.slug, required: 0, pass: 0, fail: 0, unsupported: 0, notRun: 0 };
    for (const k of c.cases.filter((x) => stages.includes(x.stage))) {
      const targets = k.layer === 'unit' ? ['vitest'] : projects;
      for (const project of targets) {
        row.required++;
        const hits = results.filter((r) => r.layer === k.layer && (k.layer === 'unit' || r.project === project) && tagsOf(r.title).some((t) => t.slug === c.slug && t.case === k.id));
        let status;
        let note = '';
        if (hits.length === 0) status = 'NOT RUN';
        else if (hits.some((h) => h.status === 'failed' || h.status === 'flaky')) status = hits.every((h) => h.status === 'passed' || exc(c.slug, k.id, project, h.status)) ? 'PASS' : 'FAIL';
        else if (hits.every((h) => h.status === 'skipped')) status = exc(c.slug, k.id, project, 'skipped') ? 'EXCEPTION' : 'NOT RUN';
        else {
          const unsup = hits.flatMap((h) => h.unsupported);
          if (!unsup.length) status = 'PASS';
          else {
            const bad = unsup.find((u) => !(k.unsupported ?? []).includes(u.capability) || !u.reason);
            if (bad) {
              status = 'FAIL';
              note = `UNSUPPORTED "${bad.capability}" is not allowed for this case or has no reason`;
            } else {
              status = 'UNSUPPORTED';
              note = unsup.map((u) => `${u.capability}: ${u.reason}`).join('; ');
            }
          }
        }
        cases.push({ slug: c.slug, case: k.id, layer: k.layer, stage: k.stage, project, status, note });
        if (status === 'PASS' || status === 'EXCEPTION') row.pass++;
        else if (status === 'UNSUPPORTED') row.unsupported++;
        else if (status === 'FAIL') {
          row.fail++;
          errors.push(`FAIL ${c.slug}:${k.id} on ${project}${note ? ` — ${note}` : ''}`);
        } else {
          row.notRun++;
          errors.push(`NOT RUN ${c.slug}:${k.id} on ${project} (${k.layer}, ${k.stage}) — no passing test tagged [${c.slug}:${k.id}]`);
        }
      }
    }
    rows.push(row);
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], rows, cases };
}

export function markdown({ rows, cases, errors, stage }) {
  const lines = [`# Tool gate (${stage})`, '', '| Tool | Required | Pass | Fail | Unsupported (verified) | Not run |', '|---|---|---|---|---|---|'];
  for (const r of rows) lines.push(`| ${r.slug} | ${r.required} | ${r.pass} | ${r.fail} | ${r.unsupported} | ${r.notRun} |`);
  const unsup = cases.filter((c) => c.status === 'UNSUPPORTED');
  if (unsup.length) lines.push('', '## Verified UNSUPPORTED', '', ...unsup.map((c) => `- ${c.slug}:${c.case} on ${c.project}: ${c.note}`));
  lines.push('', errors.length ? `## Blocking (${errors.length})` : '## Result: PASS', '', ...errors.map((e) => `- ${e}`));
  return lines.join('\n') + '\n';
}
