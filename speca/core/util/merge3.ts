// Three-way merge of canvas states (pure): a document's text line by line, objects key by key. Used when a branch is
// merged back into its chat (runtime/merge.ts) and by canvas kinds that merge their own way (speca/sdk).
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Longest common subsequence of two line lists: base index → the other's index (monotonic). */
function lcs(a: string[], b: string[]): Map<number, number> | null {
  const n = a.length, m = b.length;
  if (n * m > 16_000_000) return null;
  const L = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i * (m + 1) + j] = a[i] === b[j] ? L[(i + 1) * (m + 1) + j + 1]! + 1 : Math.max(L[(i + 1) * (m + 1) + j]!, L[i * (m + 1) + j + 1]!);
  const out = new Map<number, number>();
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { out.set(i, j); i++; j++; }
    else if (L[(i + 1) * (m + 1) + j]! >= L[i * (m + 1) + j + 1]!) i++; else j++;
  }
  return out;
}

/** Three versions of a text merged line by line: a part changed on one side takes that side, changed alike on both
 *  is kept once; changed differently on both is a conflict — both kept (ours first) when `keepBoth`, else ours. */
export function merge3(base: string, ours: string, theirs: string, keepBoth = true): { text: string; conflicts: number } {
  if (ours === theirs || theirs === base) return { text: ours, conflicts: 0 };
  if (ours === base) return { text: theirs, conflicts: 0 };
  const B = base.split("\n"), O = ours.split("\n"), T = theirs.split("\n");
  const mo = lcs(B, O), mt = lcs(B, T);
  if (!mo || !mt) return { text: ours, conflicts: 1 };
  const eq = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  const out: string[] = [];
  let conflicts = 0, b = 0, o = 0, t = 0;
  const anchors = [...mo.keys()].filter((i) => mt.has(i));
  for (const a of [...anchors, B.length]) {
    const oe = a < B.length ? mo.get(a)! : O.length, te = a < B.length ? mt.get(a)! : T.length;
    const bs = B.slice(b, a), os = O.slice(o, oe), ts = T.slice(t, te);
    if (eq(os, bs)) out.push(...ts);
    else if (eq(ts, bs) || eq(os, ts)) out.push(...os);
    else { out.push(...os, ...(keepBoth ? ts : [])); conflicts++; }
    if (a < B.length) out.push(B[a]!);
    b = a + 1; o = oe + 1; t = te + 1;
  }
  return { text: out.join("\n"), conflicts };
}

/** Any canvas state merged three ways: objects key by key, lists of names as a union (what one side dropped goes),
 *  a document's text line by line (both kept where both changed it), a page's html line by line (ours where both
 *  changed the same lines); anything else changed on both sides keeps ours (a conflict). */
export function mergeState(base: unknown, ours: unknown, theirs: unknown, key = ""): { state: unknown; conflicts: number } {
  if (same(ours, theirs) || same(theirs, base)) return { state: ours, conflicts: 0 };
  if (same(ours, base)) return { state: theirs, conflicts: 0 };
  if (typeof ours === "string" && typeof theirs === "string" && typeof base === "string" && (key === "markdown" || key === "html")) {
    const r = merge3(base, ours, theirs, key === "markdown");
    return { state: r.text, conflicts: r.conflicts };
  }
  if (Array.isArray(ours) && Array.isArray(theirs) && [...ours, ...theirs].every((x) => typeof x === "string")) {
    const was = Array.isArray(base) ? (base as string[]) : [];
    const kept = (ours as string[]).filter((x) => !(was.includes(x) && !(theirs as string[]).includes(x)));
    return { state: [...kept, ...(theirs as string[]).filter((x) => !kept.includes(x) && !was.includes(x))], conflicts: 0 };
  }
  if (isObj(ours) && isObj(theirs)) {
    const b = isObj(base) ? base : {};
    const out: Record<string, unknown> = {};
    let conflicts = 0;
    for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(b)])) {
      const inO = k in ours, inT = k in theirs, inB = k in b;
      if (!inO && !inT) continue;
      if (!inT && inB && same(ours[k], b[k])) continue;             // dropped in the branch, untouched here
      if (!inO && inB && same(theirs[k], b[k])) continue;           // dropped here, untouched in the branch
      if (!inO) { out[k] = theirs[k]; if (inB) conflicts++; continue; }
      if (!inT) { out[k] = ours[k]; if (inB) conflicts++; continue; }
      const r = mergeState(b[k], ours[k], theirs[k], k);
      out[k] = r.state; conflicts += r.conflicts;
    }
    return { state: out, conflicts };
  }
  return { state: ours, conflicts: 1 };
}

