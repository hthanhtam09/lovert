// Minimal implementation of Cloudflare Pages `_headers` matching, for LOCAL checks only.
// Supports absolute-URL rules with :placeholders in the host and `*` splats in the path.
// Real Cloudflare behaviour must still be confirmed on a deployed Preview (docs/launch-indexing.md).

export function parseHeaders(text) {
  const rules = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      cur = { pattern: raw.trim(), headers: {} };
      rules.push(cur);
    } else if (cur) {
      const i = raw.indexOf(':');
      cur.headers[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
    }
  }
  return rules;
}

function toRegex(pattern) {
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // :placeholder → one DNS label / path segment; * → anything.
  return new RegExp('^' + esc.replace(/:[a-zA-Z]\w*/g, '[^./]+').replace(/\*/g, '.*') + '$');
}

/** Headers for a request. `host` without port, `path` starting with '/'. */
export function headersFor(rules, host, path) {
  const out = {};
  for (const r of rules) {
    const target = /^https?:\/\//.test(r.pattern) ? `https://${host}${path}` : path;
    if (toRegex(r.pattern).test(target)) Object.assign(out, r.headers);
  }
  return out;
}
