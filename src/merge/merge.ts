/**
 * Line-based diff and three-way merge, for resolving sync conflicts. Lines
 * keep their terminators, so merging reproduces files byte for byte.
 */

export type Side = "android" | "server";

export type Chunk =
  | { kind: "same"; lines: string[] }
  /** Changed on one side only, or the same way on both: merged automatically */
  | { kind: "change"; from: Side | "both"; lines: string[]; removed: string[] }
  /** Changed differently on both sides, or no common version is known */
  | { kind: "conflict"; base: string[] | null; android: string[]; server: string[] };

/** What to keep of a conflicting chunk; "both" puts Android's lines first */
export type Pick = Side | "both";

/** Above this many cells, a changed region isn't aligned line by line */
const MAX_ALIGN = 4_000_000;

export const splitLines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/**
 * For each line of `a`, the index of the same line in `b` (or -1), following
 * a longest common subsequence. Matches always increase in both.
 */
export const lcsMatch = (a: string[], b: string[]): number[] => {
  const match = new Array<number>(a.length).fill(-1);

  // Most edits are local: align the common start and end directly
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    match[start] = start;
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
    match[endA] = endB;
  }

  const n = endA - start;
  const m = endB - start;
  if (n === 0 || m === 0 || n * m > MAX_ALIGN) return match;

  const ids = new Map<string, number>();
  const id = (line: string) => {
    let value = ids.get(line);
    if (value === undefined) ids.set(line, (value = ids.size));
    return value;
  };
  const A = Int32Array.from({ length: n }, (_, i) => id(a[start + i]));
  const B = Int32Array.from({ length: m }, (_, j) => id(b[start + j]));

  // L[i][j]: length of the longest common subsequence of A[i..] and B[j..]
  const w = m + 1;
  const L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] =
        A[i] === B[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    }
  }
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (A[i] === B[j]) {
      match[start + i] = start + j;
      i++;
      j++;
    } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) i++;
    else j++;
  }
  return match;
};

/**
 * Merges Android's and the server's version of a file. With the last
 * version both agreed on (`base`), changes made on one side only are taken
 * automatically and only overlapping changes are conflicts. Without it,
 * every difference is a conflict.
 */
export const merge = (android: string, server: string, base: string | null): Chunk[] => {
  const p = splitLines(android);
  const s = splitLines(server);
  return base === null ? twoWay(p, s) : threeWay(splitLines(base), p, s);
};

const threeWay = (o: string[], p: string[], s: string[]): Chunk[] => {
  const mp = lcsMatch(o, p);
  const ms = lcsMatch(o, s);
  const chunks = new Chunks();
  let io = 0;
  let ip = 0;
  let is = 0;
  while (io < o.length || ip < p.length || is < s.length) {
    // Lines all three versions share
    let k = 0;
    while (io + k < o.length && mp[io + k] === ip + k && ms[io + k] === is + k) k++;
    if (k > 0) {
      chunks.same(o.slice(io, io + k));
      io += k;
      ip += k;
      is += k;
      continue;
    }
    // Up to the next base line both sides still have
    let jo = io;
    while (jo < o.length && (mp[jo] < 0 || ms[jo] < 0)) jo++;
    const [eo, ep, es] = jo < o.length ? [jo, mp[jo], ms[jo]] : [o.length, p.length, s.length];
    chunks.unstable(o.slice(io, eo), p.slice(ip, ep), s.slice(is, es));
    io = eo;
    ip = ep;
    is = es;
  }
  return chunks.list;
};

const twoWay = (p: string[], s: string[]): Chunk[] => {
  const match = lcsMatch(p, s);
  const chunks = new Chunks();
  let ip = 0;
  let is = 0;
  while (ip < p.length || is < s.length) {
    let k = 0;
    while (ip + k < p.length && match[ip + k] === is + k) k++;
    if (k > 0) {
      chunks.same(p.slice(ip, ip + k));
      ip += k;
      is += k;
      continue;
    }
    let jp = ip;
    while (jp < p.length && match[jp] < 0) jp++;
    const [ep, es] = jp < p.length ? [jp, match[jp]] : [p.length, s.length];
    chunks.list.push({ kind: "conflict", base: null, android: p.slice(ip, ep), server: s.slice(is, es) });
    ip = ep;
    is = es;
  }
  return chunks.list;
};

class Chunks {
  list: Chunk[] = [];

  same(lines: string[]) {
    const last = this.list[this.list.length - 1];
    if (last?.kind === "same") last.lines.push(...lines);
    else this.list.push({ kind: "same", lines: [...lines] });
  }

  /** A region where the sides differ from the base: classified like diff3 */
  unstable(o: string[], p: string[], s: string[]) {
    const pSame = equal(p, o);
    const sSame = equal(s, o);
    if (pSame && sSame) this.same(o);
    else if (pSame) this.list.push({ kind: "change", from: "server", lines: s, removed: o });
    else if (sSame) this.list.push({ kind: "change", from: "android", lines: p, removed: o });
    else if (equal(p, s)) this.list.push({ kind: "change", from: "both", lines: p, removed: o });
    else this.list.push({ kind: "conflict", base: o, android: p, server: s });
  }
}

const equal = (a: string[], b: string[]) => a.length === b.length && a.every((line, i) => line === b[i]);

/** The merged text, or null while a conflict has no pick yet */
export const mergedText = (chunks: Chunk[], picks: Record<number, Pick>): string | null => {
  let out = "";
  for (const [i, chunk] of chunks.entries()) {
    if (chunk.kind !== "conflict") {
      out += chunk.lines.join("");
      continue;
    }
    const pick = picks[i];
    if (!pick) return null;
    const android = pick === "server" ? "" : chunk.android.join("");
    const server = pick === "android" ? "" : chunk.server.join("");
    // Keeping both of two last lines without a final newline: don't glue them
    out += android && server && !android.endsWith("\n") ? `${android}\n${server}` : android + server;
  }
  return out;
};

export const conflictCount = (chunks: Chunk[]) => chunks.filter((c) => c.kind === "conflict").length;
