// ─────────────────────────────────────────────────────────────────────────────
// MODEL / path — tiny path DSL for the rules engine. Paths run against a Ship
// root: "params.seal.weight", "manifest.crates[2].trade", "arrivedAt".
// "[i]" is a placeholder resolved to the chosen crate index by the forgery
// injector (spec §9.2, §10).
// ─────────────────────────────────────────────────────────────────────────────

type Token = string | number;

function tokenize(path: string): Token[] {
  const out: Token[] = [];
  for (const seg of path.split(".")) {
    const m = seg.match(/^([A-Za-z]\w*)((\[\d+\])*)$/);
    if (!m) throw new Error(`bad path segment "${seg}" in "${path}"`);
    out.push(m[1]);
    if (m[2]) {
      for (const idx of m[2].match(/\[(\d+)\]/g) ?? []) {
        out.push(parseInt(idx.slice(1, -1), 10));
      }
    }
  }
  return out;
}

export function resolvePath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const tok of tokenize(path)) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof tok === "number") {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[tok];
    } else {
      cur = (cur as Record<string, unknown>)[tok];
    }
  }
  return cur;
}

/** Mutates root in place (callers pass a fresh clone). */
export function setPath(root: unknown, path: string, value: unknown): void {
  const tokens = tokenize(path);
  let cur: unknown = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const tok = tokens[i];
    cur = typeof tok === "number" ? (cur as unknown[])[tok] : (cur as Record<string, unknown>)[tok];
    if (cur === null || cur === undefined) throw new Error(`dead path "${path}"`);
  }
  const last = tokens[tokens.length - 1];
  if (typeof last === "number") {
    if (!Array.isArray(cur)) throw new Error(`bad array path "${path}"`);
    cur[last] = value;
  } else {
    (cur as Record<string, unknown>)[last] = value;
  }
}

/** Substitute the chosen crate index placeholder: "crates[i].trade" → "crates[2].trade". */
export const withIndex = (path: string, i: number | null): string =>
  i === null ? path.replace("[i]", "[0]") : path.replace("[i]", `[${i}]`);
