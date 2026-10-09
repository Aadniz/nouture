import { Headline, OrgDocument, flatten } from "./parse";

/** org-cycle's states: FOLDED -> CHILDREN -> SUBTREE */
export type Visibility = "folded" | "children" | "subtree";

export interface Folds {
  headlines: Record<number, Visibility>;
  /** Drawers and blocks the user toggled, by line */
  open: Record<number, boolean>;
  hideBlocks: boolean;
}

/** Initial visibility from #+STARTUP, like org-startup-folded. */
export const initialFolds = (doc: OrgDocument): Folds => {
  const startup = doc.startup.map((s) => s.toLowerCase());
  const levels = startup
    .map((s) => /^show(\d+)levels$/.exec(s))
    .find((m) => m !== null);

  const visibility = (h: Headline): Visibility => {
    if (startup.includes("overview") || startup.includes("fold")) return "folded";
    if (startup.includes("content")) return "children";
    if (levels) return h.level < Number(levels[1]) ? "children" : "folded";
    return "subtree";
  };

  return {
    headlines: Object.fromEntries(
      flatten(doc.headlines).map((h) => [h.line, visibility(h)])
    ),
    open: {},
    hideBlocks: startup.includes("hideblocks"),
  };
};

export const visibilityOf = (folds: Folds, h: Headline): Visibility =>
  folds.headlines[h.line] ?? "subtree";

/** TAB on a headline. */
export const cycle = (folds: Folds, h: Headline): Folds => {
  const current = visibilityOf(folds, h);
  const next: Visibility =
    current === "folded"
      ? h.children.length > 0
        ? "children"
        : "subtree"
      : current === "children"
        ? "subtree"
        : "folded";

  const headlines = { ...folds.headlines, [h.line]: next };
  if (next === "children") h.children.forEach((c) => (headlines[c.line] = "folded"));
  if (next === "subtree") flatten(h.children).forEach((c) => (headlines[c.line] = "subtree"));
  return { ...folds, headlines };
};

export const isOpen = (folds: Folds, line: number, kind: "drawer" | "block") =>
  folds.open[line] ?? (kind === "block" ? !folds.hideBlocks : false);

export const toggleOpen = (folds: Folds, line: number, kind: "drawer" | "block"): Folds => ({
  ...folds,
  open: { ...folds.open, [line]: !isOpen(folds, line, kind) },
});
