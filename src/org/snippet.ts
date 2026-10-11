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
 * edit's headline when that's close, or else where its content begins. An
 * edit near the end fills the rest of the preview with the lines before it.
 */
export const snippet = (
  doc: OrgDocument,
  edited: { start: number; end: number } | undefined,
  maxLines: number
): Snippet => {
  const total = doc.lines.length;
  // Where the content begins, after the #+ lines at the top
  let top = doc.lines.findIndex((l) => l.trim() !== "" && !KEYWORD_LINE.test(l));
  if (top < 0) top = 0;
  let from = top;

  if (edited && edited.start < total) {
    const owner = headlinePath(doc.headlines, edited.start).at(-1);
    from =
      owner && edited.start - owner.line < maxLines / 2
        ? owner.line
        : Math.max(0, edited.start - 1);
  }

  const lines: SnippetLine[] = [];
  const add = (i: number, place: "push" | "unshift") => {
    const text = doc.lines[i];
    // Blank lines waste the little room a preview has
    if (text.trim() === "") return;
    lines[place]({
      line: i,
      text,
      edited: !!edited && i >= edited.start && i <= edited.end,
    });
  };
  for (let i = from; i < total && lines.length < maxLines; i++) add(i, "push");
  for (let i = from - 1; i >= top && lines.length < maxLines; i--) add(i, "unshift");

  const first = lines[0]?.line ?? from;
  const crumbs = headlinePath(doc.headlines, first)
    .filter((h) => h.line < first)
    .map((h) => h.title.replace(COOKIE, "").trim());
  return { crumbs, lines };
};
