import { isDone } from "./keywords";
import { Headline, OrgDocument, headlinePath, parse, parseItem, serialize } from "./parse";

/**
 * Text edits that behave like their org-mode commands. Only the touched lines
 * change; everything else (including line endings) is kept byte-for-byte.
 */

const COOKIE = /\[(\d*)\/(\d*)\]|\[(\d*)%\]/g;
const HEADLINE_START = /^(\*+\s+)(.*)$/;
const CHECKBOX = /^(\s*(?:[-+*]|\d+[.)])\s+)\[[ X-]\]/;

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
  const start = section ? section.line + 1 : 0;
  const end = sectionEnd(lines, start);

  // Walk up through the parent items, like org-update-checkbox-count
  let indent = item.indent;
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

  if (section) {
    const updated = parse(serialize({ lines, eols: doc.eols }));
    const fresh = headlinePath(updated.headlines, section.line).pop();
    if (fresh) lines[section.line] = recountHeadline(updated, fresh);
  }
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
