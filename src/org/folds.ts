import type { LineMap } from "./edit";
import { isDone } from "./keywords";
import { Headline, OrgDocument, flatten, headlinePath } from "./parse";

/**
 * What shows below a headline:
 * - folded: nothing
 * - headings: its sub-headlines, not its text (the content views)
 * - children: its text and its sub-headlines, folded (org-cycle's CHILDREN)
 * - subtree: everything
 */
export type Visibility = "folded" | "headings" | "children" | "subtree";

export interface Folds {
  headlines: Record<number, Visibility>;
  /** Drawers and blocks the user toggled, by line */
  open: Record<number, boolean>;
  hideBlocks: boolean;
  hideDrawers: boolean;
}

type View =
  | { kind: "overview" | "showall" | "showeverything" }
  /** Headlines down to `levels`, without their text */
  | { kind: "content"; levels: number };

/** The #+STARTUP options for org-startup-folded */
const viewOf = (option: string): View | null => {
  if (option === "overview" || option === "fold") return { kind: "overview" };
  if (option === "content") return { kind: "content", levels: Infinity };
  const levels = /^show([2-5])levels$/.exec(option);
  if (levels) return { kind: "content", levels: Number(levels[1]) };
  if (option === "showall" || option === "nofold") return { kind: "showall" };
  if (option === "showeverything") return { kind: "showeverything" };
  return null;
};

const startVisibility = (view: View | null, h: Headline): Visibility => {
  if (view?.kind === "overview") return "folded";
  if (view?.kind === "content") return h.level < view.levels ? "headings" : "folded";
  return "subtree";
};

/** A property from the entry's :PROPERTIES: drawer */
const property = (h: Headline, name: string) => {
  const drawer = h.body.find((b) => b.kind === "drawer" && b.name.toUpperCase() === "PROPERTIES");
  if (drawer?.kind !== "drawer") return undefined;
  const pattern = new RegExp(`^\\s*:${name}:\\s+(\\S+)`, "i");
  return drawer.lines.map((l) => pattern.exec(l)?.[1]).find((v) => v !== undefined)?.toLowerCase();
};

/**
 * The visibility a note opens with, like org-cycle-set-startup-visibility:
 * the #+STARTUP view (the last one wins; without one, Org's default
 * showeverything), then :VISIBILITY: properties and :ARCHIVE: subtrees.
 * On top of that, done entries start folded, unless the file asks for
 * showeverything.
 */
export const initialFolds = (doc: OrgDocument): Folds => {
  let view: View | null = null;
  let hideBlocks = false; // org-cycle-hide-block-startup
  let hideDrawers = true; // org-cycle-hide-drawer-startup
  for (const option of doc.startup.map((s) => s.toLowerCase())) {
    view = viewOf(option) ?? view;
    if (option === "hideblocks" || option === "nohideblocks") hideBlocks = option === "hideblocks";
    if (option === "hidedrawers" || option === "nohidedrawers") hideDrawers = option === "hidedrawers";
  }
  // showeverything ignores everything else that folds
  const everything = !view || view.kind === "showeverything";

  const all = flatten(doc.headlines);
  const headlines: Record<number, Visibility> = Object.fromEntries(
    all.map((h) => [h.line, startVisibility(view, h)])
  );
  const setSubtree = (h: Headline, v: Visibility) => flatten([h]).forEach((d) => (headlines[d.line] = v));

  if (view?.kind !== "showeverything") {
    for (const h of all) {
      if (h.keyword && isDone(doc.sequences, h.keyword)) headlines[h.line] = "folded";
    }
  }
  if (!everything) {
    for (const h of all) {
      const v = property(h, "VISIBILITY");
      if (v === "folded") headlines[h.line] = "folded";
      if (v === "children") {
        headlines[h.line] = "children";
        h.children.forEach((c) => (headlines[c.line] = "folded"));
      }
      if (v === "content") setSubtree(h, "headings");
      if (v === "all" || v === "showall") setSubtree(h, "subtree");
    }
    for (const h of all) if (h.tags.includes("ARCHIVE")) headlines[h.line] = "folded";
  }

  return {
    headlines,
    open: {},
    hideBlocks: !everything && hideBlocks,
    hideDrawers: !everything && hideDrawers,
  };
};

export const visibilityOf = (folds: Folds, h: Headline): Visibility =>
  folds.headlines[h.line] ?? "subtree";

/** Whether the headline's own text shows */
export const showsText = (v: Visibility) => v === "children" || v === "subtree";

/** Whether anything below the headline shows: its arrow points down */
export const isExpanded = (folds: Folds, h: Headline) => {
  const v = visibilityOf(folds, h);
  return (
    (showsText(v) && h.body.some((b) => b.kind !== "blank")) ||
    (v !== "folded" && h.children.length > 0)
  );
};

/**
 * TAB on a headline, like org-cycle: FOLDED -> CHILDREN -> SUBTREE, skipping
 * CHILDREN when there are none. A headline showing nothing below it counts
 * as folded.
 */
export const cycle = (folds: Folds, h: Headline): Folds => {
  const next: Visibility = !isExpanded(folds, h)
    ? h.children.length > 0
      ? "children"
      : "subtree"
    : visibilityOf(folds, h) === "children"
      ? "subtree"
      : "folded";

  const headlines = { ...folds.headlines, [h.line]: next };
  if (next === "children") h.children.forEach((c) => (headlines[c.line] = "folded"));
  if (next === "subtree") flatten(h.children).forEach((c) => (headlines[c.line] = "subtree"));
  return { ...folds, headlines };
};

export const isOpen = (folds: Folds, line: number, kind: "drawer" | "block") =>
  folds.open[line] ?? !(kind === "block" ? folds.hideBlocks : folds.hideDrawers);

export const toggleOpen = (folds: Folds, line: number, kind: "drawer" | "block"): Folds => ({
  ...folds,
  open: { ...folds.open, [line]: !isOpen(folds, line, kind) },
});

/** After an edit: folds follow their lines, and those of removed lines go. */
export const remapFolds = (folds: Folds, map: LineMap): Folds => {
  const remap = <T,>(byLine: Record<number, T>) =>
    Object.fromEntries(
      Object.entries(byLine).flatMap(([key, value]) => {
        const line = map(Number(key));
        return line === null ? [] : [[line, value]];
      })
    ) as Record<number, T>;
  return { ...folds, headlines: remap(folds.headlines), open: remap(folds.open) };
};

/**
 * Makes the headline at `line` show, with what's below it if `self`: folded
 * ancestors (and itself) open to CHILDREN.
 */
export const unfold = (folds: Folds, doc: OrgDocument, line: number, self = false): Folds => {
  const path = headlinePath(doc.headlines, line);
  const opening = self ? path : path.slice(0, -1);
  const headlines = { ...folds.headlines };
  for (const h of opening) {
    if (headlines[h.line] === "folded") headlines[h.line] = "children";
  }
  return { ...folds, headlines };
};
