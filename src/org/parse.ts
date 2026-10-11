import { TodoSequence, allKeywords, todoSequences } from "./keywords";

/**
 * A line-oriented org parser. Every node remembers the line(s) it came from,
 * so edits can rewrite exactly those lines and leave the rest byte-identical.
 */

export type Block =
  | { kind: "blank"; line: number }
  | { kind: "keyword"; line: number; key: string; value: string }
  | { kind: "planning"; line: number; text: string }
  | { kind: "comment"; line: number; text: string }
  | { kind: "drawer"; line: number; end: number; name: string; lines: string[] }
  | {
      kind: "block";
      line: number;
      end: number;
      type: string;
      params: string;
      lines: string[];
    }
  | { kind: "table"; line: number; end: number; lines: string[] }
  | { kind: "item"; line: number; item: ListItem }
  | { kind: "text"; line: number; indent: number; text: string };

export interface ListItem {
  indent: number;
  bullet: string;
  checkbox: " " | "X" | "-" | null;
  text: string;
}

export interface Headline {
  line: number;
  level: number;
  keyword: string | null;
  priority: string | null;
  title: string;
  tags: string[];
  body: Block[];
  children: Headline[];
}

export interface OrgDocument {
  /** Lines without their terminators. */
  lines: string[];
  /** The terminator of each line ("" for a last line without one). */
  eols: string[];
  sequences: TodoSequence[];
  startup: string[];
  body: Block[];
  headlines: Headline[];
}

const HEADLINE = /^(\*+)\s(.*)$/;
const PRIORITY = /^\[#([A-Za-z0-9])\]\s*/;
const TAGS = /\s+(:(?:[\w@#%]+:)+)\s*$/;
const PLANNING = /^\s*(?:SCHEDULED|DEADLINE|CLOSED):/;
const DRAWER_START = /^\s*:([\w-]+):\s*$/;
const DRAWER_END = /^\s*:END:\s*$/i;
const BLOCK_START = /^\s*#\+BEGIN_(\S+)(.*)$/i;
const KEYWORD = /^\s*#\+(\w+):\s?(.*)$/;
const COMMENT = /^\s*#(?:\s|$)/;
const TABLE = /^\s*\|/;
// "*" only counts as a bullet when indented; otherwise it's a headline
const ITEM = /^(\s*)([-+]|\d+[.)])(?:\s+|$)(?:\[([ X-])\](?:\s+|$))?(.*)$/;
const STAR_ITEM = /^(\s+)(\*)(?:\s+|$)(?:\[([ X-])\](?:\s+|$))?(.*)$/;

export const parse = (text: string): OrgDocument => {
  const lines: string[] = [];
  const eols: string[] = [];
  for (const match of text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)) {
    if (match[0] === "" && match.index === text.length) break;
    lines.push(match[1]);
    eols.push(match[2]);
  }

  const sequences = todoSequences(lines);
  const keywords = allKeywords(sequences);
  const startup = lines.flatMap((line) => {
    const match = /^\s*#\+STARTUP:\s*(.*)$/i.exec(line);
    return match ? match[1].trim().split(/\s+/) : [];
  });

  const root: Headline = {
    line: -1,
    level: 0,
    keyword: null,
    priority: null,
    title: "",
    tags: [],
    body: [],
    children: [],
  };
  const stack: Headline[] = [root];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const current = stack[stack.length - 1];

    const headline = HEADLINE.exec(line);
    if (headline) {
      const node = parseHeadline(i, headline[1].length, headline[2], keywords);
      while (stack[stack.length - 1].level >= node.level) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      i++;
      continue;
    }

    const block = parseBlock(lines, i, current);
    current.body.push(block);
    i = "end" in block ? block.end + 1 : i + 1;
  }

  return {
    lines,
    eols,
    sequences,
    startup,
    body: root.body,
    headlines: root.children,
  };
};

export const serialize = (doc: Pick<OrgDocument, "lines" | "eols">) =>
  doc.lines.map((line, i) => line + doc.eols[i]).join("");

export const parseHeadline = (
  line: number,
  level: number,
  content: string,
  keywords: string[]
): Headline => {
  let rest = content;

  const keyword =
    keywords.find((k) => rest === k || rest.startsWith(k + " ")) ?? null;
  if (keyword) rest = rest.slice(keyword.length).trimStart();

  const priority = PRIORITY.exec(rest);
  if (priority) rest = rest.slice(priority[0].length);

  const tags = TAGS.exec(rest);
  if (tags) rest = rest.slice(0, tags.index);

  return {
    line,
    level,
    keyword,
    priority: priority ? priority[1] : null,
    title: rest,
    tags: tags ? tags[1].split(":").filter(Boolean) : [],
    body: [],
    children: [],
  };
};

const parseBlock = (lines: string[], i: number, current: Headline): Block => {
  const line = lines[i];

  if (line.trim() === "") return { kind: "blank", line: i };

  if (PLANNING.test(line) && current.line === i - 1) {
    return { kind: "planning", line: i, text: line.trim() };
  }

  const drawer = DRAWER_START.exec(line);
  if (drawer && drawer[1].toUpperCase() !== "END") {
    const end = findEnd(lines, i, (l) => DRAWER_END.test(l) || HEADLINE.test(l));
    if (end !== null && DRAWER_END.test(lines[end])) {
      return {
        kind: "drawer",
        line: i,
        end,
        name: drawer[1],
        lines: lines.slice(i + 1, end),
      };
    }
  }

  const block = BLOCK_START.exec(line);
  if (block) {
    const type = block[1];
    const endRe = new RegExp(`^\\s*#\\+END_${escape(type)}\\s*$`, "i");
    const end = findEnd(lines, i, (l) => endRe.test(l));
    if (end !== null) {
      return {
        kind: "block",
        line: i,
        end,
        type,
        params: block[2].trim(),
        lines: lines.slice(i + 1, end),
      };
    }
  }

  const keyword = KEYWORD.exec(line);
  if (keyword) {
    return { kind: "keyword", line: i, key: keyword[1], value: keyword[2] };
  }

  if (COMMENT.test(line)) return { kind: "comment", line: i, text: line };

  if (TABLE.test(line)) {
    let end = i;
    while (end + 1 < lines.length && TABLE.test(lines[end + 1])) end++;
    return { kind: "table", line: i, end, lines: lines.slice(i, end + 1) };
  }

  const item = parseItem(line);
  if (item) return { kind: "item", line: i, item };

  const indent = line.length - line.trimStart().length;
  return { kind: "text", line: i, indent, text: line.trim() };
};

export const parseItem = (line: string): ListItem | null => {
  const match = ITEM.exec(line) ?? STAR_ITEM.exec(line);
  if (!match) return null;
  return {
    indent: match[1].length,
    bullet: match[2].trim(),
    checkbox: (match[3] as ListItem["checkbox"]) ?? null,
    text: match[4],
  };
};

const findEnd = (
  lines: string[],
  start: number,
  isEnd: (line: string) => boolean
): number | null => {
  for (let j = start + 1; j < lines.length; j++) {
    if (isEnd(lines[j])) return j;
  }
  return null;
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Tags used in the file and offered by #+TAGS / #+FILETAGS, sorted. */
export const knownTags = (doc: OrgDocument): string[] => {
  const declared = doc.lines.flatMap((line) => {
    const match = /^\s*#\+(?:FILE)?TAGS:\s*(.*)$/i.exec(line);
    // "work(w) { @home @office }", ":a:b:"
    return match ? match[1].split(/[\s:{}]+/).map((tag) => tag.replace(/\(.*\)$/, "")) : [];
  });
  const used = flatten(doc.headlines).flatMap((h) => h.tags);
  return [...new Set([...declared, ...used])]
    .filter((tag) => /^[\w@#%]+$/.test(tag))
    .sort((a, b) => a.localeCompare(b));
};

/** The priorities from highest to lowest: #+PRIORITIES or Org's A to C. */
export const priorities = (doc: OrgDocument): string[] => {
  const line = doc.lines.find((l) => /^\s*#\+PRIORITIES:/i.test(l));
  const [high, low] = line?.replace(/^\s*#\+PRIORITIES:/i, "").trim().split(/\s+/) ?? [];
  const range = (from: string, to: string) =>
    Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) =>
      String.fromCharCode(from.charCodeAt(0) + i)
    );
  if (high && low && /^[A-Z]$/.test(high) && /^[A-Z]$/.test(low) && high <= low) return range(high, low);
  if (high && low && /^\d$/.test(high) && /^\d$/.test(low) && Number(high) <= Number(low)) {
    return Array.from({ length: Number(low) - Number(high) + 1 }, (_, i) => String(Number(high) + i));
  }
  return range("A", "C");
};

/** Every headline in document order. */
export const flatten = (headlines: Headline[]): Headline[] =>
  headlines.flatMap((h) => [h, ...flatten(h.children)]);

/** The chain of headlines from the top down to the one containing `line`. */
export const headlinePath = (headlines: Headline[], line: number): Headline[] => {
  let candidates = headlines;
  const path: Headline[] = [];
  for (;;) {
    const next = [...candidates].reverse().find((h) => h.line <= line);
    if (!next) return path;
    path.push(next);
    if (next.line === line) return path;
    candidates = next.children;
  }
};
