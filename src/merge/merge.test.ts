import { describe, expect, it } from "vitest";
import { Chunk, conflictCount, lcsMatch, merge, mergedText, splitLines } from "./merge";

const BASE = `#+title: Notes

* Tasks
** TODO Buy a hat
** TODO Renew domains
** DONE Call the bank
* Ideas
- Custom sticker
- Bigger desk
`;

const pickAll = (chunks: Chunk[], pick: "android" | "server" | "both") =>
  Object.fromEntries(chunks.flatMap((c, i) => (c.kind === "conflict" ? [[i, pick]] : [])));

describe("splitLines", () => {
  it("keeps line endings, so joining gives the text back", () => {
    for (const text of ["a\nb\n", "a\nb", "a\r\nb\r\n", "", "\n\n", "x"]) {
      expect(splitLines(text).join("")).toBe(text);
    }
  });
});

describe("lcsMatch", () => {
  it("matches a longest common subsequence, increasing on both sides", () => {
    const match = lcsMatch(["a", "b", "c", "d", "e"], ["a", "x", "c", "d", "y", "e"]);
    expect(match).toEqual([0, -1, 2, 3, 5]);
  });
});

describe("three-way merge", () => {
  it("takes a change made on one side only", () => {
    const server = BASE.replace("- Custom sticker\n", "");
    const chunks = merge(BASE, server, BASE);
    expect(conflictCount(chunks)).toBe(0);
    expect(mergedText(chunks, {})).toBe(server);
    expect(chunks.find((c) => c.kind === "change")).toMatchObject({ from: "server", removed: ["- Custom sticker\n"] });
  });

  it("combines changes in different places", () => {
    const android = BASE.replace("TODO Buy a hat", "DONE Buy a hat");
    const server = BASE.replace("- Bigger desk\n", "- Bigger desk\n- New chair\n");
    const chunks = merge(android, server, BASE);
    expect(conflictCount(chunks)).toBe(0);
    expect(mergedText(chunks, {})).toBe(BASE.replace("TODO Buy a hat", "DONE Buy a hat").replace("- Bigger desk\n", "- Bigger desk\n- New chair\n"));
  });

  it("takes the same change made on both sides once", () => {
    const both = BASE.replace("TODO Renew domains", "DONE Renew domains");
    const chunks = merge(both, both, BASE);
    expect(conflictCount(chunks)).toBe(0);
    expect(chunks.find((c) => c.kind === "change")).toMatchObject({ from: "both" });
    expect(mergedText(chunks, {})).toBe(both);
  });

  it("makes different changes to the same lines a conflict to pick", () => {
    const android = BASE.replace("TODO Buy a hat", "DONE Buy a hat");
    const server = BASE.replace("TODO Buy a hat", "TODO Buy a red hat");
    const chunks = merge(android, server, BASE);
    expect(conflictCount(chunks)).toBe(1);
    const i = chunks.findIndex((c) => c.kind === "conflict");
    expect(chunks[i]).toEqual({
      kind: "conflict",
      base: ["** TODO Buy a hat\n"],
      android: ["** DONE Buy a hat\n"],
      server: ["** TODO Buy a red hat\n"],
    });
    expect(mergedText(chunks, {})).toBeNull();
    expect(mergedText(chunks, { [i]: "android" })).toBe(android);
    expect(mergedText(chunks, { [i]: "server" })).toBe(server);
    expect(mergedText(chunks, { [i]: "both" })).toContain("** DONE Buy a hat\n** TODO Buy a red hat\n");
  });

  it("makes deleting what the other side edited a conflict", () => {
    const android = BASE.replace("* Ideas\n- Custom sticker\n- Bigger desk\n", "");
    const server = BASE.replace("- Bigger desk", "- Bigger standing desk");
    expect(conflictCount(merge(android, server, BASE))).toBe(1);
  });

  it("is byte-exact with CRLF and without a final newline", () => {
    const base = BASE.replace(/\n/g, "\r\n").replace(/\r\n$/, "");
    const server = base.replace("Call the bank", "Call the bank today");
    expect(mergedText(merge(base, server, base), {})).toBe(server);
  });
});

describe("two-way merge (no common version)", () => {
  it("makes every difference a conflict, keeping what both share", () => {
    const android = BASE.replace("TODO Buy a hat", "DONE Buy a hat");
    const server = BASE.replace("- Bigger desk\n", "");
    const chunks = merge(android, server, null);
    expect(conflictCount(chunks)).toBe(2);
    expect(mergedText(chunks, pickAll(chunks, "android"))).toBe(android);
    expect(mergedText(chunks, pickAll(chunks, "server"))).toBe(server);
  });
});

describe("randomized", () => {
  // Deterministic pseudo-random edits of a 40-line file
  let seed = 42;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const lines = Array.from({ length: 40 }, (_, i) => `line ${i}\n`);
  const edit = (from: string[]) => {
    const out = [...from];
    for (let n = 1 + Math.floor(random() * 4); n > 0; n--) {
      const at = Math.floor(random() * out.length);
      const op = random();
      if (op < 0.33) out.splice(at, 1);
      else if (op < 0.66) out.splice(at, 0, `new ${Math.floor(random() * 1000)}\n`);
      else out[at] = `changed ${Math.floor(random() * 1000)}\n`;
    }
    return out.join("");
  };

  it("reproduces either side exactly when picked everywhere (two-way)", () => {
    for (let run = 0; run < 200; run++) {
      const android = edit(lines);
      const server = edit(lines);
      const chunks = merge(android, server, null);
      expect(mergedText(chunks, pickAll(chunks, "android"))).toBe(android);
      expect(mergedText(chunks, pickAll(chunks, "server"))).toBe(server);
    }
  });

  it("takes the changed side when only one side changed (three-way)", () => {
    const base = lines.join("");
    for (let run = 0; run < 200; run++) {
      const changed = edit(lines);
      for (const [android, server] of [[base, changed], [changed, base]]) {
        const chunks = merge(android, server, base);
        expect(conflictCount(chunks)).toBe(0);
        expect(mergedText(chunks, {})).toBe(changed);
      }
    }
  });

  it("reproduces Android's version when its side is picked and the server didn't change", () => {
    const base = lines.join("");
    for (let run = 0; run < 100; run++) {
      const android = edit(lines);
      const chunks = merge(android, base, base);
      expect(mergedText(chunks, pickAll(chunks, "android"))).toBe(android);
    }
  });
});
