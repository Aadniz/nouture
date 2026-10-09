import { OrgDocument, headlinePath } from "./parse";

export interface SnippetLine {
  line: number;
  text: string;
  /** Part of the last edit */
  edited: boolean;
}

export interface Snippet {
  /** Titles of the headlines above the first shown line */
  crumbs: string[];
  lines: SnippetLine[];
}

const KEYWORD_LINE = /^\s*#\+/;
const COOKIE = /\[\d*\/\d*\]|\[\d*%\]/g;

/**
 * The lines to preview for a note: around its last edit, starting at the
 * edit's headline when that's close, or else where its content begins.
 */
export const snippet = (
  doc: OrgDocument,
  edited: { start: number; end: number } | undefined,
  maxLines: number
): Snippet => {
  const total = doc.lines.length;
  let from: number;

  if (edited && edited.start < total) {
    const owner = headlinePath(doc.headlines, edited.start).at(-1);
    from =
      owner && edited.start - owner.line < maxLines / 2
        ? owner.line
        : Math.max(0, edited.start - 1);
  } else {
    from = doc.lines.findIndex((l) => l.trim() !== "" && !KEYWORD_LINE.test(l));
    if (from < 0) from = 0;
  }

  const lines: SnippetLine[] = [];
  for (let i = from; i < total && lines.length < maxLines; i++) {
    const text = doc.lines[i];
    // Blank lines waste the little room a preview has
    if (text.trim() === "") continue;
    lines.push({
      line: i,
      text,
      edited: !!edited && i >= edited.start && i <= edited.end,
    });
  }

  const crumbs = headlinePath(doc.headlines, from)
    .filter((h) => h.line < from)
    .map((h) => h.title.replace(COOKIE, "").trim());
  return { crumbs, lines };
};
