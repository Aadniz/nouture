import { isDone, sequenceOf } from "./keywords";
import { Headline, ListItem, OrgDocument, flatten, headlinePath, parse, parseItem, serialize } from "./parse";

/**
 * Text edits that behave like their org-mode commands. Only the touched lines
 * change; everything else (including line endings) is kept byte-for-byte.
 */

const COOKIE = /\[(\d*)\/(\d*)\]|\[(\d*)%\]/g;
const HEADLINE_START = /^(\*+\s+)(.*)$/;
const CHECKBOX = /^(\s*(?:[-+*]|\d+[.)])\s+)\[[ X-]\]/;
const TAGS_END = /(\s+)(:(?:[\w@#%]+:)+)\s*$/;

/** Where each line of the old text ended up; null for removed lines */
export type LineMap = (line: number) => number | null;

export const sameLines: LineMap = (line) => line;

/** An edit that adds, removes or moves lines */
export interface Edit {
  text: string;
  map: LineMap;
}

/** The headline at `line` with its parent and neighbouring siblings */
export const entryAt = (doc: OrgDocument, line: number) => {
  const path = headlinePath(doc.headlines, line);
  const headline = path.at(-1);
  if (!headline || headline.line !== line) return null;
  const parent = path.at(-2) ?? null;
  const siblings = parent ? parent.children : doc.headlines;
  const index = siblings.indexOf(headline);
  return { headline, parent, prev: siblings[index - 1] ?? null, next: siblings[index + 1] ?? null };
};

/**
 * Promoting needs a level to go up to; demoting needs a previous sibling to
 * go under, so no level is skipped.
 */
export const canShift = (doc: OrgDocument, line: number, delta: 1 | -1) => {
  const entry = entryAt(doc, line);
  return !!entry && (delta < 0 ? entry.headline.level > 1 : entry.prev !== null);
};

/** First line after the headline's subtree */
export const subtreeEnd = (doc: OrgDocument, h: Headline) =>
  flatten(doc.headlines).find((o) => o.line > h.line && o.level <= h.level)?.line ??
  doc.lines.length;

/** The end of the subtree without its trailing blank lines */
const contentEnd = (doc: OrgDocument, h: Headline) => {
  let end = subtreeEnd(doc, h);
  while (end > h.line + 1 && doc.lines[end - 1].trim() === "") end--;
  return end;
};

/** Only the last line may lack a terminator, and it ends like the file did. */
const fixEnding = (doc: OrgDocument, eols: string[]) => {
  const eol = doc.eols.find((e) => e !== "") ?? "\n";
  const last = doc.lines.length > 0 ? doc.eols[doc.lines.length - 1] : eol;
  eols.forEach((e, i) => {
    if (e === "") eols[i] = eol;
  });
  if (eols.length > 0) eols[eols.length - 1] = last;
};

/** Puts line ranges that together cover one stretch of the file in this order */
const rearrange = (doc: OrgDocument, ranges: [number, number][]) => {
  const start = Math.min(...ranges.map(([from]) => from));
  const lines = doc.lines.slice(0, start);
  const eols = doc.eols.slice(0, start);
  const moved = new Map<number, number>();
  for (const [from, to] of ranges) {
    for (let l = from; l < to; l++) {
      moved.set(l, lines.length);
      lines.push(doc.lines[l]);
      eols.push(doc.eols[l]);
    }
  }
  lines.push(...doc.lines.slice(lines.length));
  eols.push(...doc.eols.slice(eols.length));
  fixEnding(doc, eols);
  const map: LineMap = (line) => moved.get(line) ?? line;
  return { lines, eols, map };
};

const insertLines = (doc: OrgDocument, at: number, inserted: string[]) => {
  const lines = [...doc.lines];
  const eols = [...doc.eols];
  lines.splice(at, 0, ...inserted);
  eols.splice(at, 0, ...inserted.map(() => ""));
  fixEnding(doc, eols);
  const map: LineMap = (line) => (line >= at ? line + inserted.length : line);
  return { lines, eols, map };
};

/** Recounts the [n/m] cookies of the headlines at these lines */
const recount = (lines: string[], eols: string[], at: (number | null | undefined)[]) => {
  const updated = parse(serialize({ lines, eols }));
  for (const line of new Set(at)) {
    if (line == null) continue;
    const headline = headlinePath(updated.headlines, line).pop();
    if (headline?.line === line) lines[line] = recountHeadline(updated, headline);
  }
};

const setStars = (line: string, level: number) => line.replace(/^\*+/, "*".repeat(level));

/** org-todo: set (or clear) a headline's keyword, then update the parent's [n/m]. */
export const setTodo = (
  text: string,
  line: number,
  keyword: string | null
): string => {
  const doc = parse(text);
  const path = headlinePath(doc.headlines, line);
  const headline = path[path.length - 1];
  if (!headline || headline.line !== line || headline.keyword === keyword) {
    return text;
  }

  const lines = [...doc.lines];
  const [, stars, content] = HEADLINE_START.exec(lines[line]) ?? [];
  let rest = content ?? "";
  if (headline.keyword) rest = rest.slice(headline.keyword.length).trimStart();
  lines[line] = stars + [keyword, rest].filter(Boolean).join(" ");

  const parent = path[path.length - 2];
  if (parent) {
    const updated = parse(serialize({ lines, eols: doc.eols }));
    const fresh = headlinePath(updated.headlines, parent.line).pop();
    if (fresh) lines[parent.line] = recountHeadline(updated, fresh);
  }
  return serialize({ lines, eols: doc.eols });
};

/** org-toggle-checkbox: flip an item's box, then fix parent boxes and cookies. */
export const toggleCheckbox = (text: string, line: number): string => {
  const doc = parse(text);
  const item = parseItem(doc.lines[line]);
  if (!item?.checkbox) return text;

  const lines = [...doc.lines];
  lines[line] = setBox(lines[line], item.checkbox === "X" ? " " : "X");

  const section = headlinePath(doc.headlines, line).pop();
  refreshParentItems(lines, line, item.indent, section ? section.line + 1 : 0);
  recount(lines, doc.eols, [section?.line]);
  return serialize({ lines, eols: doc.eols });
};

/**
 * Like org-update-checkbox-count: walks up from an item at `line` (indented
 * `indent`), fixing each parent item's box and [n/m] from its children.
 */
const refreshParentItems = (lines: string[], line: number, indent: number, start: number) => {
  const end = sectionEnd(lines, start);
  for (let p = line - 1; p >= start && indent > 0; p--) {
    if (lines[p].trim() === "") continue;
    const parent = parseItem(lines[p]);
    const lineIndent = lines[p].length - lines[p].trimStart().length;
    if (!parent) {
      if (lineIndent < indent) break; // the list ended
      continue;
    }
    if (parent.indent >= indent) continue;
    indent = parent.indent;

    const boxes = itemChildren(lines, p, end)
      .map((c) => parseItem(lines[c])?.checkbox)
      .filter((box) => box != null);
    if (boxes.length === 0) continue;
    const checked = boxes.filter((box) => box === "X").length;
    if (parent.checkbox) {
      const partial = checked > 0 || boxes.includes("-");
      lines[p] = setBox(
        lines[p],
        checked === boxes.length ? "X" : partial ? "-" : " "
      );
    }
    lines[p] = writeCookies(lines[p], checked, boxes.length);
  }
};

const ORDERED = /^(\d+)([.)])$/;

/** The bullet after this one: the next number in an ordered list */
const nextBullet = (bullet: string) => {
  const ordered = ORDERED.exec(bullet);
  return ordered ? `${Number(ordered[1]) + 1}${ordered[2]}` : bullet;
};

const indentOf = (line: string) => line.length - line.trimStart().length;

/** The first line after the item at `line`: past its text and sub-items */
const itemEnd = (lines: string[], line: number, end: number) => {
  const indent = parseItem(lines[line])!.indent;
  let last = line;
  for (let i = line + 1; i < end; i++) {
    if (lines[i].trim() === "") continue;
    if (indentOf(lines[i]) <= indent) break;
    last = i;
  }
  return last + 1;
};

/** Renumbers the ordered items at `indent` from line `from` on, by `delta` */
const shiftNumbers = (lines: string[], from: number, indent: number, delta: number) => {
  for (let i = from; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    if (indentOf(lines[i]) > indent) continue;
    const item = parseItem(lines[i]);
    if (indentOf(lines[i]) < indent || !item || /^\*+\s/.test(lines[i])) break;
    const ordered = ORDERED.exec(item.bullet);
    if (ordered) lines[i] = lines[i].replace(/^(\s*)\d+/, (_, lead) => `${lead}${Number(ordered[1]) + delta}`);
  }
};

/** The headline whose section has `line`, and where that section starts */
const sectionOf = (doc: OrgDocument, line: number) => {
  const section = headlinePath(doc.headlines, line).pop();
  return { section, start: section ? section.line + 1 : 0 };
};

/**
 * A first, empty item at the end of the entry's own text, before its
 * sub-entries. Returns where it is.
 */
export const startList = (text: string, line: number): Edit & { line: number } => {
  const doc = parse(text);
  const h = entryAt(doc, line)?.headline;
  if (!h) return { text, map: sameLines, line: -1 };
  let at = h.children[0]?.line ?? subtreeEnd(doc, h);
  while (at > h.line + 1 && doc.lines[at - 1].trim() === "") at--;
  const { lines, eols, map } = insertLines(doc, at, ["- "]);
  return { text: serialize({ lines, eols }), map, line: at };
};

/**
 * org-insert-item: an empty item after the item at `line` (and its
 * sub-items), or as its last sub-item. It gets a box when its siblings have
 * one. Returns where the new item is.
 */
export const addItem = (text: string, line: number, child: boolean): Edit & { line: number } => {
  const doc = parse(text);
  const item = parseItem(doc.lines[line]);
  if (!item) return { text, map: sameLines, line: -1 };
  const { section, start } = sectionOf(doc, line);
  const end = sectionEnd(doc.lines, line + 1);
  const at = itemEnd(doc.lines, line, end);

  // A sibling gets the item's indentation; a sub-item its siblings', or goes under the text
  let lead = doc.lines[line].slice(0, item.indent);
  let bullet = nextBullet(item.bullet);
  let boxed = item.checkbox !== null;
  if (child) {
    const lastLine = itemChildren(doc.lines, line, end).at(-1);
    const last = lastLine === undefined ? null : parseItem(doc.lines[lastLine])!;
    lead = last ? doc.lines[lastLine!].slice(0, last.indent) : lead + " ".repeat(item.bullet.length + 1);
    bullet = last ? nextBullet(last.bullet) : "-";
    boxed = last ? last.checkbox !== null : boxed;
  }
  const { lines, eols, map } = insertLines(doc, at, [`${lead}${bullet} ${boxed ? "[ ] " : ""}`]);
  if (!child) shiftNumbers(lines, at + 1, lead.length, 1);
  refreshParentItems(lines, at, lead.length, start);
  recount(lines, eols, [section?.line]);
  return { text: serialize({ lines, eols }), map, line: at };
};

/** An item's text, keeping its bullet and box */
export const setItemText = (text: string, line: number, value: string): string => {
  const doc = parse(text);
  const item = parseItem(doc.lines[line]);
  const clean = value.replace(/\s+/g, " ").trim();
  if (!item || clean === item.text) return text;
  const lines = [...doc.lines];
  lines[line] = itemLine(doc.lines[line], item, item.checkbox, clean);
  return serialize({ lines, eols: doc.eols });
};

/** org-toggle-checkbox with a prefix: gives an item a box, or takes it away */
export const toggleItemBox = (text: string, line: number): string => {
  const doc = parse(text);
  const item = parseItem(doc.lines[line]);
  if (!item) return text;
  const lines = [...doc.lines];
  lines[line] = itemLine(doc.lines[line], item, item.checkbox === null ? " " : null, item.text);
  const { section, start } = sectionOf(doc, line);
  refreshParentItems(lines, line, item.indent, start);
  recount(lines, doc.eols, [section?.line]);
  return serialize({ lines, eols: doc.eols });
};

/** Removes an item with its sub-items, then fixes the numbers, boxes and [n/m] around it */
export const deleteItem = (text: string, line: number): Edit => {
  const doc = parse(text);
  const item = parseItem(doc.lines[line]);
  if (!item) return { text, map: sameLines };
  const { section, start } = sectionOf(doc, line);
  const end = itemEnd(doc.lines, line, sectionEnd(doc.lines, line + 1));

  const lines = [...doc.lines];
  const eols = [...doc.eols];
  lines.splice(line, end - line);
  eols.splice(line, end - line);
  fixEnding(doc, eols);
  shiftNumbers(lines, line, item.indent, -1);
  refreshParentItems(lines, line, item.indent, start);
  recount(lines, eols, [section?.line]);

  const removed = end - line;
  const map: LineMap = (l) => (l < line ? l : l < end ? null : l - removed);
  return { text: serialize({ lines, eols }), map };
};

/** An item line from its parts; the indentation stays as it was */
const itemLine = (old: string, item: ListItem, box: ListItem["checkbox"], text: string) =>
  `${old.slice(0, item.indent)}${item.bullet} ${box === null ? "" : `[${box}] `}${text}`;

/**
 * org-toggle-item on an entry's sub-entries: they become a list in their
 * place, nested like they were. A TODO state becomes a box ([X] when done);
 * priority and tags stay in the text. Each entry's text, planning and
 * properties go under its item (Emacs drops the latter two), so
 * listToEntries can bring them back.
 */
export const entriesToList = (text: string, line: number): Edit => {
  const doc = parse(text);
  const h = entryAt(doc, line)?.headline;
  if (!h || h.children.length === 0) return { text, map: sameLines };

  const from = h.children[0].line;
  const end = contentEnd(doc, h);
  const items: string[] = [];
  for (const child of flatten(h.children)) {
    const indent = " ".repeat((child.level - h.level - 1) * 2);
    let rest = doc.lines[child.line].replace(/^\*+\s*/, "");
    if (child.keyword) rest = rest.slice(child.keyword.length).trimStart();
    const box = child.keyword ? (isDone(doc.sequences, child.keyword) ? "[X] " : "[ ] ") : "";
    items.push(`${indent}- ${box}${rest}`);

    const body = doc.lines.slice(child.line + 1, child.children[0]?.line ?? subtreeEnd(doc, child));
    const shift = Math.min(...body.filter((l) => l.trim() !== "").map(indentOf));
    for (const l of body) items.push(l.trim() === "" ? "" : `${indent}  ${l.slice(shift)}`);
  }
  // Two blank lines in a row would end the list
  const list = items.filter((l, i) => l !== "" || (i > 0 && items[i - 1] !== ""));
  while (list.at(-1) === "") list.pop();

  const lines = [...doc.lines.slice(0, from), ...list, ...doc.lines.slice(end)];
  const eols = [...doc.eols.slice(0, from), ...list.map(() => ""), ...doc.eols.slice(end)];
  fixEnding(doc, eols);
  recount(lines, eols, [h.line]);
  const delta = list.length - (end - from);
  const map: LineMap = (l) => (l < from ? l : l < end ? null : l + delta);
  return { text: serialize({ lines, eols }), map };
};

/**
 * org-toggle-heading on an entry's lists: each item becomes a sub-entry,
 * nested items deeper. Boxes become TODO states, [X] the first done one,
 * and an item's other lines become its entry's text. The new entries come
 * after the entry's other text, before its existing sub-entries.
 */
export const listToEntries = (text: string, line: number): Edit => {
  const doc = parse(text);
  const h = entryAt(doc, line)?.headline;
  const items = new Set(h?.body.flatMap((b) => (b.kind === "item" ? [b.line] : [])));
  if (!h || items.size === 0) return { text, map: sameLines };

  const start = h.line + 1;
  let end = h.children[0]?.line ?? subtreeEnd(doc, h);
  while (end > start && doc.lines[end - 1].trim() === "") end--;
  const open = doc.sequences[0]?.active[0] ?? "TODO";
  const done = doc.sequences[0]?.done[0] ?? "DONE";

  const kept: string[] = [];
  const entries: string[] = [];
  const convert = (i: number, stop: number, level: number) => {
    const item = parseItem(doc.lines[i])!;
    const keyword = item.checkbox === null ? "" : `${item.checkbox === "X" ? done : open} `;
    entries.push(`${"*".repeat(level)} ${keyword}${item.text}`);
    const column = doc.lines[i].length - item.text.length;
    for (let j = i + 1; j < stop; ) {
      if (items.has(j)) {
        const childStop = itemEnd(doc.lines, j, stop);
        convert(j, childStop, level + 1);
        j = childStop;
      } else {
        const l = doc.lines[j++];
        entries.push(l.trim() === "" ? "" : l.slice(Math.min(column, indentOf(l))));
      }
    }
  };
  for (let i = start; i < end; ) {
    if (items.has(i)) {
      const stop = itemEnd(doc.lines, i, end);
      convert(i, stop, h.level + 1);
      i = stop;
    } else {
      kept.push(doc.lines[i++]);
    }
  }
  // Without the blank lines that were around the list
  const other = kept.filter((l, i) => l.trim() !== "" || (i > 0 && kept[i - 1].trim() !== ""));
  while (other.length > 0 && other.at(-1)!.trim() === "") other.pop();

  const section = [...other, ...entries];
  const lines = [...doc.lines.slice(0, start), ...section, ...doc.lines.slice(end)];
  const eols = [...doc.eols.slice(0, start), ...section.map(() => ""), ...doc.eols.slice(end)];
  fixEnding(doc, eols);
  recount(lines, eols, [h.line]);
  const delta = section.length - (end - start);
  const map: LineMap = (l) => (l < start ? l : l < end ? null : l + delta);
  return { text: serialize({ lines, eols }), map };
};

/**
 * org-cut-subtree: removes a headline with its body and sub-entries, then
 * updates the parent's [n/m]. Returns the text and how many lines went.
 */
export const deleteEntry = (text: string, line: number): Edit & { removed: number } => {
  const doc = parse(text);
  const entry = entryAt(doc, line);
  if (!entry) return { text, map: sameLines, removed: 0 };

  const end = subtreeEnd(doc, entry.headline);
  const lines = [...doc.lines];
  const eols = [...doc.eols];
  lines.splice(line, end - line);
  eols.splice(line, end - line);
  // Removing the last lines: the file still ends like it did
  fixEnding(doc, eols);
  recount(lines, eols, [entry.parent?.line]);

  const removed = end - line;
  const map: LineMap = (l) => (l < line ? l : l < end ? null : l - removed);
  return { text: serialize({ lines, eols }), map, removed };
};

/** org-move-subtree-up/down: swaps places with the previous or next sibling. */
export const moveSubtree = (text: string, line: number, direction: "up" | "down"): Edit => {
  const doc = parse(text);
  const entry = entryAt(doc, line);
  const other = entry && (direction === "up" ? entry.prev : entry.next);
  if (!entry || !other) return { text, map: sameLines };

  // Blank lines between the two stay where they are
  const [first, second] = direction === "up" ? [other, entry.headline] : [entry.headline, other];
  const a = contentEnd(doc, first);
  const b = contentEnd(doc, second);
  const { lines, eols, map } = rearrange(doc, [
    [second.line, b],
    [a, second.line],
    [first.line, a],
  ]);
  return { text: serialize({ lines, eols }), map };
};

/**
 * org-promote-subtree / org-demote-subtree: one star less or more on every
 * headline in it. Like in Emacs the text stays put, so promoting an entry
 * takes the siblings below it in as children.
 */
export const shiftSubtree = (text: string, line: number, delta: 1 | -1): string => {
  const doc = parse(text);
  const entry = entryAt(doc, line);
  if (!entry || !canShift(doc, line, delta)) return text;

  const lines = [...doc.lines];
  for (const h of flatten([entry.headline])) lines[h.line] = setStars(lines[h.line], h.level + delta);
  const updated = parse(serialize({ lines, eols: doc.eols }));
  const newParent = headlinePath(updated.headlines, line).at(-2);
  recount(lines, doc.eols, [entry.parent?.line, newParent?.line, line]);
  return serialize({ lines, eols: doc.eols });
};

/**
 * Moves a subtree to just before line `before` (the file's length for its
 * end), re-levelled to `level`. Its trailing blank lines go along, like
 * cutting and yanking it in Emacs.
 */
export const moveSubtreeTo = (text: string, line: number, before: number, level: number): Edit => {
  const doc = parse(text);
  const entry = entryAt(doc, line);
  if (!entry) return { text, map: sameLines };

  const start = line;
  const end = subtreeEnd(doc, entry.headline);
  const inPlace = before >= start && before <= end;
  const { lines, eols, map } = inPlace
    ? { lines: [...doc.lines], eols: [...doc.eols], map: sameLines }
    : rearrange(doc, before < start ? [[start, end], [before, start]] : [[end, before], [start, end]]);

  const delta = Math.max(1, level) - entry.headline.level;
  for (const h of flatten([entry.headline])) {
    const at = map(h.line)!;
    lines[at] = setStars(lines[at], h.level + delta);
  }
  const moved = map(line)!;
  const updated = parse(serialize({ lines, eols }));
  const newParent = headlinePath(updated.headlines, moved).at(-2);
  recount(lines, eols, [entry.parent && map(entry.parent.line), newParent?.line]);
  if (inPlace && delta === 0) return { text, map: sameLines };
  return { text: serialize({ lines, eols }), map };
};

/**
 * org-insert-heading-respect-content: an empty headline after the entry's
 * subtree, as its next sibling or its last child. Like
 * org-insert-todo-heading it gets the first open state of the entry's
 * keyword. Returns where the new headline is.
 */
export const addEntry = (text: string, line: number, child: boolean): Edit & { line: number } => {
  const doc = parse(text);
  const entry = entryAt(doc, line);
  if (!entry) return { text, map: sameLines, line: -1 };

  const h = entry.headline;
  const keyword = h.keyword ? sequenceOf(doc.sequences, h.keyword)?.active[0] ?? null : null;
  const at = subtreeEnd(doc, h);
  // Set apart from what follows like the entry is
  const blanks = at < doc.lines.length ? at - contentEnd(doc, h) : 0;
  const level = h.level + (child ? 1 : 0);
  const { lines, eols, map } = insertLines(doc, at, [headlineText(level, keyword), ...Array(blanks).fill("")]);
  recount(lines, eols, [child ? h.line : entry.parent?.line]);
  return { text: serialize({ lines, eols }), map, line: at };
};

/** A top-level empty headline at the end of the file */
export const appendEntry = (text: string): Edit & { line: number } => {
  const doc = parse(text);
  const { lines, eols, map } = insertLines(doc, doc.lines.length, [headlineText(1, null)]);
  return { text: serialize({ lines, eols }), map, line: doc.lines.length };
};

const headlineText = (level: number, keyword: string | null) =>
  `${"*".repeat(level)} ${keyword ?? ""}`;

export const setTitle = (text: string, line: number, title: string) =>
  rewriteHeadline(text, line, { title: title.replace(/\s+/g, " ").trim() });

export const setPriority = (text: string, line: number, priority: string | null) =>
  rewriteHeadline(text, line, { priority });

export const setTags = (text: string, line: number, tags: string[]) =>
  rewriteHeadline(text, line, { tags });

/**
 * Writes a headline back from its parts. Org aligns tags to a column, so
 * aligned tags keep ending where they did.
 */
const rewriteHeadline = (
  text: string,
  line: number,
  change: Partial<Pick<Headline, "title" | "priority" | "tags">>
): string => {
  const doc = parse(text);
  const h = entryAt(doc, line)?.headline;
  if (!h) return text;
  const same = (Object.keys(change) as (keyof typeof change)[]).every(
    (key) => JSON.stringify(h[key]) === JSON.stringify(change[key])
  );
  if (same) return text;

  const next = { ...h, ...change };
  const old = doc.lines[line];
  const [, stars] = HEADLINE_START.exec(old) ?? [];
  const head = stars + [next.keyword, next.priority && `[#${next.priority}]`, next.title.trim()].filter(Boolean).join(" ");
  let tags = "";
  if (next.tags.length > 0) {
    const label = `:${next.tags.join(":")}:`;
    const aligned = TAGS_END.exec(old);
    const end = aligned && aligned[1].length > 1 ? old.trimEnd().length : 0;
    tags = " ".repeat(Math.max(1, end - head.length - label.length)) + label;
  }

  const lines = [...doc.lines];
  lines[line] = head + tags;
  return serialize({ lines, eols: doc.eols });
};

/**
 * A headline's [n/m] counts the checkboxes in its entry if it has any,
 * otherwise its direct children that have a TODO keyword.
 */
const recountHeadline = (doc: OrgDocument, headline: Headline): string => {
  const line = doc.lines[headline.line];
  if (!line.match(COOKIE)) return line;

  const items = headline.body.flatMap((b) => (b.kind === "item" ? [b.item] : []));
  const topIndent = Math.min(...items.map((i) => i.indent));
  const boxes = items.filter((i) => i.indent === topIndent && i.checkbox);
  if (boxes.length > 0) {
    const checked = boxes.filter((i) => i.checkbox === "X").length;
    return writeCookies(line, checked, boxes.length);
  }

  const todos = headline.children.filter((c) => c.keyword);
  const done = todos.filter((c) => isDone(doc.sequences, c.keyword!)).length;
  return writeCookies(line, done, todos.length);
};

const writeCookies = (line: string, done: number, total: number) =>
  line.replace(COOKIE, (cookie) =>
    cookie.includes("%")
      ? `[${total === 0 ? 0 : Math.floor((done * 100) / total)}%]`
      : `[${done}/${total}]`
  );

const setBox = (line: string, box: "X" | " " | "-") =>
  line.replace(CHECKBOX, `$1[${box}]`);

/** The direct child items of the item at line `p`. */
const itemChildren = (lines: string[], p: number, end: number): number[] => {
  const indent = parseItem(lines[p])!.indent;
  const children: number[] = [];
  let childIndent = Infinity;
  for (let c = p + 1; c < end; c++) {
    if (lines[c].trim() === "") continue;
    const lineIndent = lines[c].length - lines[c].trimStart().length;
    if (lineIndent <= indent) break;
    const child = parseItem(lines[c]);
    if (!child) continue;
    if (child.indent < childIndent) {
      childIndent = child.indent;
      children.length = 0;
    }
    if (child.indent === childIndent) children.push(c);
  }
  return children;
};

/** First line of the next headline at or after `start`. */
const sectionEnd = (lines: string[], start: number) => {
  for (let i = start; i < lines.length; i++) {
    if (/^\*+\s/.test(lines[i])) return i;
  }
  return lines.length;
};
