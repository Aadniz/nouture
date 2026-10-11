export interface TodoSequence {
  active: string[];
  done: string[];
}

/** Doom Emacs' default org-todo-keywords. */
export const DOOM_SEQUENCES: TodoSequence[] = [
  {
    active: ["TODO", "PROJ", "LOOP", "STRT", "WAIT", "HOLD", "IDEA"],
    done: ["DONE", "KILL"],
  },
  { active: ["[ ]", "[-]", "[?]"], done: ["[X]"] },
  { active: [], done: ["OKAY", "YES", "NO"] },
];

const TODO_LINE = /^\s*#\+(?:SEQ_|TYP_)?TODO:\s*(.*)$/i;

/** Reads #+TODO: lines; falls back to Doom's defaults like Emacs would. */
export const todoSequences = (lines: string[]): TodoSequence[] => {
  const sequences = lines.flatMap((line) => {
    const match = TODO_LINE.exec(line);
    return match ? [parseSequence(match[1])] : [];
  });
  return sequences.length > 0 ? sequences : DOOM_SEQUENCES;
};

const parseSequence = (spec: string): TodoSequence => {
  // "TODO(t) WAIT(w@/!) | DONE(d)" -> drop the fast-access keys
  const words = spec
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/\(.*\)$/, ""));
  const bar = words.indexOf("|");
  if (bar >= 0) {
    return { active: words.slice(0, bar), done: words.slice(bar + 1) };
  }
  // Without "|" the last keyword is the done state
  return { active: words.slice(0, -1), done: words.slice(-1) };
};

export const allKeywords = (sequences: TodoSequence[]) =>
  sequences.flatMap((s) => [...s.active, ...s.done]);

export const isDone = (sequences: TodoSequence[], keyword: string) =>
  sequences.some((s) => s.done.includes(keyword));

export const sequenceOf = (sequences: TodoSequence[], keyword: string) =>
  sequences.find(
    (s) => s.active.includes(keyword) || s.done.includes(keyword)
  );

/**
 * How a keyword is shown, after Doom's faces: +org-todo-active (STRT, [-]),
 * +org-todo-project (PROJ), +org-todo-onhold (WAIT, HOLD, [?]) and
 * +org-todo-cancel (NO, KILL); other open ones look like TODO.
 */
export type KeywordKind = "todo" | "active" | "project" | "onhold" | "done" | "cancel";

const KINDS: Record<string, KeywordKind> = {
  STRT: "active",
  "[-]": "active",
  PROJ: "project",
  WAIT: "onhold",
  HOLD: "onhold",
  "[?]": "onhold",
  NO: "cancel",
  KILL: "cancel",
};

export const keywordKind = (sequences: TodoSequence[], keyword: string): KeywordKind =>
  KINDS[keyword] ?? (isDone(sequences, keyword) ? "done" : "todo");

/** Checkbox-style states like "[ ]" belong together, apart from word states */
export const isBoxKeyword = (keyword: string) => /^\[.\]$/.test(keyword);

/**
 * The states offered for a headline: first those of the same style as its
 * current one (open states, then done ones), then the rest.
 */
export const pickerGroups = (sequences: TodoSequence[], current: string | null) => {
  const box = current !== null && isBoxKeyword(current);
  const same = (k: string) => isBoxKeyword(k) === box;
  const done = sequences.flatMap((s) => s.done);
  const open = sequences.flatMap((s) => s.active);
  return {
    done: done.filter(same),
    open: open.filter(same),
    other: [...open, ...done].filter((k) => !same(k)),
  };
};
