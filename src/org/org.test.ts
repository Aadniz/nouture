import { describe, expect, it } from "vitest";
import {
  addEntry,
  appendEntry,
  canShift,
  deleteEntry,
  moveSubtree,
  moveSubtreeTo,
  setPriority,
  setTags,
  setTitle,
  setTodo,
  shiftSubtree,
  toggleCheckbox,
} from "./edit";
import { parseInline } from "./inline";
import { DOOM_SEQUENCES, keywordKind, pickerGroups, todoSequences } from "./keywords";
import { flatten, knownTags, parse, priorities, serialize } from "./parse";
import { cycle, initialFolds, isExpanded, remapFolds, unfold, visibilityOf } from "./folds";
import { snippet } from "./snippet";

const NOTES = `#+TITLE: Tasks
#+STARTUP: showchildren
#+STARTUP: hideblocks

* Main tasks
** HOLD Expand filesystem
** [2/3] Update dotfiles
*** DONE Shell config
*** DONE Editor config
*** TODO Status bar
** TODO [#A] Buy a hat :shopping:
SCHEDULED: <2026-04-17 Fri>
:PROPERTIES:
:ARCHIVE_TIME: 2026-04-13 Mon 11:04
:END:
** [1/3] Wishlist
- [X] Lamp
- [ ] Chair
  with armrests
- [ ] Desk
** [0/2] Feature requests
*** [ ] Like button
*** [ ] Search by creator
** [1/4] Submit page
*** TODO Move category
*** Should not count
*** [X] AI tags
*** [ ] Force duplicates
*** [ ] Switch modes
** Nested [0%]
- [ ] Parent [0/2]
  - [ ] Child one
  - [ ] Child two
#+BEGIN_SRC sh
echo "* not a headline"
#+END_SRC
`;

const lineOf = (text: string, needle: string) =>
  text.split("\n").findIndex((l) => l.includes(needle));

describe("parse", () => {
  it("round-trips byte-for-byte, including CRLF and a missing final newline", () => {
    for (const text of [NOTES, NOTES.replace(/\n/g, "\r\n"), "* a\n- b", "", "\n\n"]) {
      expect(serialize(parse(text))).toBe(text);
    }
  });

  it("parses headlines with Doom's keywords, priorities and tags", () => {
    const headlines = flatten(parse(NOTES).headlines);
    const hat = headlines.find((h) => h.title.includes("hat"))!;
    expect(hat).toMatchObject({ keyword: "TODO", priority: "A", title: "Buy a hat", tags: ["shopping"] });
    expect(hat.body.map((b) => b.kind)).toEqual(["planning", "drawer"]);

    const like = headlines.find((h) => h.title === "Like button")!;
    expect(like.keyword).toBe("[ ]");
    expect(headlines.find((h) => h.title.startsWith("Expand"))!.keyword).toBe("HOLD");
  });

  it("keeps block contents out of the outline", () => {
    const doc = parse(NOTES);
    expect(flatten(doc.headlines).some((h) => h.title.includes("not a headline"))).toBe(false);
    expect(doc.startup).toEqual(["showchildren", "hideblocks"]);
  });

  it("reads #+TODO sequences", () => {
    expect(todoSequences(["#+TODO: TODO(t) WAIT(w@/!) | DONE(d)", "#+SEQ_TODO: OPEN CLOSED"])).toEqual([
      { active: ["TODO", "WAIT"], done: ["DONE"] },
      { active: ["OPEN"], done: ["CLOSED"] },
    ]);
    expect(todoSequences([])).toBe(DOOM_SEQUENCES);
  });
});

describe("setTodo", () => {
  it("changes only the headline and its parent's cookie", () => {
    const line = lineOf(NOTES, "TODO Status bar");
    const out = setTodo(NOTES, line, "DONE");
    expect(out.split("\n")[line]).toBe("*** DONE Status bar");
    expect(out.split("\n")[lineOf(NOTES, "Update dotfiles")]).toBe("** [3/3] Update dotfiles");
    expect(changedLines(NOTES, out)).toHaveLength(2);
  });

  it("adds and removes keywords, keeping priority and tags", () => {
    const line = lineOf(NOTES, "Buy a hat");
    expect(setTodo(NOTES, line, null).split("\n")[line]).toBe("** [#A] Buy a hat :shopping:");
    const expand = lineOf(NOTES, "Expand filesystem");
    expect(setTodo(NOTES, expand, "TODO").split("\n")[expand]).toBe("** TODO Expand filesystem");
  });

  it("counts bracket keywords and ignores children without a keyword", () => {
    const line = lineOf(NOTES, "[ ] Force duplicates");
    const out = setTodo(NOTES, line, "[X]");
    expect(out.split("\n")[lineOf(NOTES, "Submit page")]).toBe("** [2/4] Submit page");
    const like = lineOf(NOTES, "Like button");
    expect(setTodo(NOTES, like, "[X]").split("\n")[lineOf(NOTES, "Feature requests")]).toBe(
      "** [1/2] Feature requests"
    );
  });

  it("preserves CRLF line endings", () => {
    const crlf = NOTES.replace(/\n/g, "\r\n");
    const out = setTodo(crlf, lineOf(NOTES, "TODO Status bar"), "DONE");
    expect(out).toBe(setTodo(NOTES, lineOf(NOTES, "TODO Status bar"), "DONE").replace(/\n/g, "\r\n"));
  });
});

describe("toggleCheckbox", () => {
  it("updates the headline cookie from the entry's checkboxes", () => {
    const out = toggleCheckbox(NOTES, lineOf(NOTES, "[ ] Chair"));
    expect(out.split("\n")[lineOf(NOTES, "[ ] Chair")]).toBe("- [X] Chair");
    expect(out.split("\n")[lineOf(NOTES, "Wishlist")]).toBe("** [2/3] Wishlist");
    expect(changedLines(NOTES, out)).toHaveLength(2);
  });

  it("fixes parent boxes and nested cookies", () => {
    const once = toggleCheckbox(NOTES, lineOf(NOTES, "Child one"));
    const lines = once.split("\n");
    expect(lines[lineOf(NOTES, "Parent")]).toBe("- [-] Parent [1/2]");
    expect(lines[lineOf(NOTES, "Nested")]).toBe("** Nested [0%]");

    const twice = toggleCheckbox(once, lineOf(NOTES, "Child two")).split("\n");
    expect(twice[lineOf(NOTES, "Parent")]).toBe("- [X] Parent [2/2]");
    expect(twice[lineOf(NOTES, "Nested")]).toBe("** Nested [100%]");
  });

  it("ignores lines without a checkbox", () => {
    expect(toggleCheckbox(NOTES, lineOf(NOTES, "with armrests"))).toBe(NOTES);
  });
});

describe("parseInline", () => {
  it("finds links, emphasis, timestamps and cookies", () => {
    expect(
      parseInline("See [[https://example.com][docs]] or https://a.b/c, *now* <2026-04-17 Fri> [1/2]")
    ).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", target: "https://example.com", text: "docs" },
      { kind: "text", text: " or " },
      { kind: "link", target: "https://a.b/c", text: "https://a.b/c" },
      { kind: "text", text: ", " },
      { kind: "bold", text: "now" },
      { kind: "text", text: " " },
      { kind: "timestamp", text: "<2026-04-17 Fri>" },
      { kind: "text", text: " " },
      { kind: "cookie", text: "[1/2]", complete: false },
    ]);
  });

  it("does not treat path slashes as italics", () => {
    expect(parseInline("a/b/c and 3 * 4 * 5")).toEqual([{ kind: "text", text: "a/b/c and 3 * 4 * 5" }]);
  });
});

const changedLines = (a: string, b: string) => {
  const left = a.split("\n");
  return b.split("\n").filter((line, i) => line !== left[i]);
};

describe("snippet", () => {
  const doc = parse(NOTES);

  it("starts at the edited headline and marks the edited lines", () => {
    const line = lineOf(NOTES, "Buy a hat");
    const { crumbs, lines } = snippet(doc, { start: line, end: line }, 4);
    expect(crumbs).toEqual(["Main tasks"]);
    expect(lines[0]).toEqual({ line, text: "** TODO [#A] Buy a hat :shopping:", edited: true });
    expect(lines.slice(1).every((l) => !l.edited)).toBe(true);
    expect(lines).toHaveLength(4);
  });

  it("shows a line of context when the edit is deep inside an entry", () => {
    const line = lineOf(NOTES, "- [ ] Desk");
    const { crumbs, lines } = snippet(doc, { start: line, end: line }, 2);
    expect(crumbs).toEqual(["Main tasks", "Wishlist"]);
    expect(lines.map((l) => l.text)).toEqual(["  with armrests", "- [ ] Desk"]);
  });

  it("fills up with the lines before an edit at the end", () => {
    const line = lineOf(NOTES, "#+END_SRC");
    const { crumbs, lines } = snippet(doc, { start: line, end: line }, 4);
    expect(crumbs.at(-1)).toBe("Nested");
    expect(lines.map((l) => l.text)).toEqual([
      "  - [ ] Child two",
      "#+BEGIN_SRC sh",
      'echo "* not a headline"',
      "#+END_SRC",
    ]);
    expect(lines.map((l) => l.edited)).toEqual([false, false, false, true]);
  });

  it("starts at the content when the edit isn't known, skipping #+ lines and blanks", () => {
    const { crumbs, lines } = snippet(doc, undefined, 2);
    expect(crumbs).toEqual([]);
    expect(lines.map((l) => l.text)).toEqual(["* Main tasks", "** HOLD Expand filesystem"]);
  });
});

describe("pickerGroups", () => {
  it("offers word states together, checkbox states apart", () => {
    expect(pickerGroups(DOOM_SEQUENCES, "TODO")).toEqual({
      done: ["DONE", "KILL", "OKAY", "YES", "NO"],
      open: ["TODO", "PROJ", "LOOP", "STRT", "WAIT", "HOLD", "IDEA"],
      other: ["[ ]", "[-]", "[?]", "[X]"],
    });
    expect(pickerGroups(DOOM_SEQUENCES, "[ ]")).toEqual({
      done: ["[X]"],
      open: ["[ ]", "[-]", "[?]"],
      other: ["TODO", "PROJ", "LOOP", "STRT", "WAIT", "HOLD", "IDEA", "DONE", "KILL", "OKAY", "YES", "NO"],
    });
  });

  it("knows Doom's kinds of keywords", () => {
    const kinds = ["TODO", "STRT", "PROJ", "HOLD", "DONE", "NO", "[ ]", "[-]", "[X]"].map((k) =>
      keywordKind(DOOM_SEQUENCES, k)
    );
    expect(kinds).toEqual(["todo", "active", "project", "onhold", "done", "cancel", "todo", "active", "done"]);
  });
});

describe("deleteEntry", () => {
  it("removes the entry with its sub-entries and fixes the parent's cookie", () => {
    const line = lineOf(NOTES, "TODO Status bar");
    const { text, removed } = deleteEntry(NOTES, line);
    expect(removed).toBe(1);
    expect(text.split("\n")[lineOf(NOTES, "Update dotfiles")]).toBe("** [2/2] Update dotfiles");
    expect(text).not.toContain("Status bar");

    const parent = deleteEntry(NOTES, lineOf(NOTES, "Update dotfiles"));
    expect(parent.removed).toBe(4);
    expect(parent.text).not.toContain("Editor config");
    expect(parent.text).toContain("** TODO [#A] Buy a hat");
  });

  it("takes the body, drawers and planning lines along", () => {
    const { text } = deleteEntry(NOTES, lineOf(NOTES, "Buy a hat"));
    expect(text).not.toMatch(/Buy a hat|SCHEDULED|ARCHIVE_TIME/);
    expect(text).toContain("** [1/3] Wishlist");
  });

  it("keeps line endings and how the file ends", () => {
    const crlf = "* a\r\n** b\r\ntext\r\n* c";
    expect(deleteEntry(crlf, 1).text).toBe("* a\r\n* c");
    expect(deleteEntry(crlf, 3).text).toBe("* a\r\n** b\r\ntext");
    expect(deleteEntry("* a\n* b\n", 1).text).toBe("* a\n");
  });

  it("ignores lines that aren't headlines", () => {
    expect(deleteEntry(NOTES, lineOf(NOTES, "- [X] Lamp"))).toMatchObject({ text: NOTES, removed: 0 });
  });
});

describe("remapFolds", () => {
  it("forgets the deleted lines' folds and moves the rest up", () => {
    const folds = { headlines: { 0: "subtree", 2: "folded", 5: "children" }, open: { 3: true, 7: false }, hideBlocks: false, hideDrawers: true } as const;
    const { map } = deleteEntry("* a\n** b\n* c\ntext\n* d\n* e\n* f\n* g\n", 2);
    expect(remapFolds({ ...folds, headlines: { ...folds.headlines }, open: { ...folds.open } }, map)).toEqual({
      headlines: { 0: "subtree", 3: "children" },
      open: { 5: false },
      hideBlocks: false,
      hideDrawers: true,
    });
  });
});

const FOLD_NOTES = `* Top
Top text
** DONE Done child
Done text
** Child
Child text
*** Grandchild
** Leaf
Leaf text
* Old :ARCHIVE:
Old text
* Pinned
:PROPERTIES:
:VISIBILITY: children
:END:
Pinned text
** Kid
Kid text
`;

/** The initial folds of FOLD_NOTES under the given #+STARTUP lines */
const foldsOf = (startup: string) => {
  const doc = parse(`${startup}\n${FOLD_NOTES}`);
  const folds = initialFolds(doc);
  const byTitle = Object.fromEntries(flatten(doc.headlines).map((h) => [h.title, h]));
  const h = (title: string) => byTitle[title];
  return { folds, h, state: (title: string) => visibilityOf(folds, h(title)) };
};

describe("initialFolds", () => {
  it("shows everything without a #+STARTUP view, like Org's default, except done entries", () => {
    // showchildren isn't an Org option
    const { folds, state } = foldsOf("#+STARTUP: showchildren hideblocks");
    expect(["Top", "Child", "Grandchild", "Leaf", "Old", "Pinned", "Kid"].map(state)).toEqual(Array(7).fill("subtree"));
    expect(state("Done child")).toBe("folded");
    // showeverything keeps drawers and blocks open, whatever else is set
    expect(folds.hideBlocks).toBe(false);
    expect(folds.hideDrawers).toBe(false);
  });

  it("shows done entries too when the file asks for showeverything", () => {
    expect(foldsOf("#+STARTUP: showeverything").state("Done child")).toBe("subtree");
  });

  it("shows only the top level with overview or fold", () => {
    for (const option of ["overview", "fold"]) {
      const { folds, state } = foldsOf(`#+STARTUP: ${option}`);
      expect(state("Top")).toBe("folded");
      expect(folds.hideDrawers).toBe(true);
    }
  });

  it("shows headlines without their text with content and show<N>levels", () => {
    const content = foldsOf("#+STARTUP: content");
    expect(["Top", "Child", "Grandchild", "Leaf"].map(content.state)).toEqual(Array(4).fill("headings"));
    const two = foldsOf("#+STARTUP: show2levels");
    expect(two.state("Top")).toBe("headings");
    expect(two.state("Child")).toBe("folded");
  });

  it("follows :VISIBILITY: and folds :ARCHIVE: subtrees, except with showeverything", () => {
    const { state } = foldsOf("#+STARTUP: showall");
    expect(state("Pinned")).toBe("children");
    expect(state("Kid")).toBe("folded");
    expect(state("Old")).toBe("folded");
    expect(foldsOf("").state("Old")).toBe("subtree");
  });

  it("lets the last view win, and hides blocks when asked", () => {
    const { folds, state } = foldsOf("#+STARTUP: overview\n#+STARTUP: showall hideblocks");
    expect(state("Top")).toBe("subtree");
    expect(folds.hideBlocks).toBe(true);
  });
});

describe("cycle", () => {
  it("points the arrow down only when something below shows", () => {
    const content = foldsOf("#+STARTUP: content");
    expect(isExpanded(content.folds, content.h("Child"))).toBe(true);
    expect(isExpanded(content.folds, content.h("Leaf"))).toBe(false);
    const plain = foldsOf("");
    expect(isExpanded(plain.folds, plain.h("Done child"))).toBe(false);
  });

  it("opens a headline that shows nothing in one go, like org-cycle", () => {
    const { folds, h } = foldsOf("#+STARTUP: content");
    expect(visibilityOf(cycle(folds, h("Leaf")), h("Leaf"))).toBe("subtree");
  });

  it("goes FOLDED, CHILDREN (text and folded sub-headlines), SUBTREE, FOLDED", () => {
    const { folds: start, h } = foldsOf("#+STARTUP: overview");
    let folds = cycle(start, h("Top"));
    expect(visibilityOf(folds, h("Top"))).toBe("children");
    expect(visibilityOf(folds, h("Child"))).toBe("folded");
    folds = cycle(folds, h("Top"));
    expect(visibilityOf(folds, h("Grandchild"))).toBe("subtree");
    folds = cycle(folds, h("Top"));
    expect(visibilityOf(folds, h("Top"))).toBe("folded");
  });
});

const TAGGED = "* Tagged" + " ".repeat(52) + ":work:";
const TREE = `* Projects [1/2]
** TODO Alpha
alpha text

** DONE Beta
*** Beta child
beta text

** Gamma
* Inbox
** TODO [#B] Call mom :phone:family:
${TAGGED}
`;

const linesOf = (text: string) => text.split("\n");

describe("moveSubtree", () => {
  it("swaps with the next sibling, keeping the blank lines between in place", () => {
    const { text, map } = moveSubtree(TREE, lineOf(TREE, "Alpha"), "down");
    expect(linesOf(text).slice(0, 9)).toEqual([
      "* Projects [1/2]",
      "** DONE Beta",
      "*** Beta child",
      "beta text",
      "",
      "** TODO Alpha",
      "alpha text",
      "",
      "** Gamma",
    ]);
    expect(map(lineOf(TREE, "Alpha"))).toBe(5);
    expect(map(lineOf(TREE, "Beta child"))).toBe(2);
    expect(moveSubtree(text, 5, "up").text).toBe(TREE);
  });

  it("does nothing without a sibling to swap with", () => {
    expect(moveSubtree(TREE, lineOf(TREE, "Alpha"), "up").text).toBe(TREE);
    expect(moveSubtree(TREE, lineOf(TREE, "Gamma"), "down").text).toBe(TREE);
    expect(moveSubtree(TREE, lineOf(TREE, "alpha text"), "down").text).toBe(TREE);
  });

  it("keeps line endings and how the file ends", () => {
    expect(moveSubtree("* a\n* b", 1, "up").text).toBe("* b\n* a");
    expect(moveSubtree("* a\r\n* b\r\n", 0, "down").text).toBe("* b\r\n* a\r\n");
  });
});

describe("shiftSubtree", () => {
  it("demotes under the previous sibling, with its children, and fixes the cookie", () => {
    const lines = linesOf(shiftSubtree(TREE, lineOf(TREE, "Beta"), 1));
    expect(lines[lineOf(TREE, "Beta")]).toBe("*** DONE Beta");
    expect(lines[lineOf(TREE, "Beta child")]).toBe("**** Beta child");
    expect(lines[0]).toBe("* Projects [0/1]");
  });

  it("promotes in place, taking the siblings below in, like Emacs", () => {
    const text = shiftSubtree(TREE, lineOf(TREE, "Alpha"), -1);
    expect(linesOf(text)[lineOf(TREE, "Alpha")]).toBe("* TODO Alpha");
    expect(linesOf(text)[0]).toBe("* Projects [0/0]");
    const alpha = parse(text).headlines.find((h) => h.title === "Alpha")!;
    expect(alpha.children.map((c) => c.title)).toEqual(["Beta", "Gamma"]);
  });

  it("can't promote the top level or demote without a previous sibling", () => {
    const doc = parse(TREE);
    expect(canShift(doc, 0, -1)).toBe(false);
    expect(canShift(doc, lineOf(TREE, "Alpha"), 1)).toBe(false);
    expect(canShift(doc, lineOf(TREE, "Beta"), 1)).toBe(true);
    expect(shiftSubtree(TREE, lineOf(TREE, "Alpha"), 1)).toBe(TREE);
    expect(shiftSubtree(TREE, 0, -1)).toBe(TREE);
  });
});

describe("moveSubtreeTo", () => {
  it("moves a subtree under another parent and fixes both cookies", () => {
    const from = lineOf(TREE, "Call mom");
    const { text, map } = moveSubtreeTo(TREE, from, lineOf(TREE, "Gamma"), 2);
    const lines = linesOf(text);
    expect(lines[lineOf(TREE, "Gamma")]).toBe("** TODO [#B] Call mom :phone:family:");
    expect(lines[0]).toBe("* Projects [1/3]");
    expect(map(from)).toBe(lineOf(TREE, "Gamma"));
    expect(map(lineOf(TREE, "Gamma"))).toBe(lineOf(TREE, "Gamma") + 1);
  });

  it("re-levels the whole subtree and takes its blank lines along", () => {
    const { text } = moveSubtreeTo(TREE, lineOf(TREE, "Beta"), linesOf(TREE).length - 1, 1);
    expect(text.endsWith(`${TAGGED}\n* DONE Beta\n** Beta child\nbeta text\n\n`)).toBe(true);
    expect(linesOf(text)[0]).toBe("* Projects [0/1]");
  });

  it("only changes the level when dropped where it is", () => {
    const gamma = lineOf(TREE, "Gamma");
    const { text, map } = moveSubtreeTo(TREE, gamma, gamma + 1, 1);
    expect(linesOf(text)[gamma]).toBe("* Gamma");
    expect(map(gamma)).toBe(gamma);
    expect(moveSubtreeTo(TREE, gamma, gamma, 2).text).toBe(TREE);
  });
});

describe("addEntry", () => {
  it("adds a sibling after the subtree with the first open state, set apart like the entry", () => {
    const alpha = lineOf(TREE, "Alpha");
    const { text, line, map } = addEntry(TREE, alpha, false);
    const lines = linesOf(text);
    expect(line).toBe(lineOf(TREE, "Beta"));
    expect(lines.slice(alpha, line + 3)).toEqual(["** TODO Alpha", "alpha text", "", "** TODO", "", "** DONE Beta"]);
    expect(lines[0]).toBe("* Projects [1/3]");
    expect(map(lineOf(TREE, "Beta"))).toBe(line + 2);
  });

  it("adds a last child without a keyword when the entry has none", () => {
    const gamma = lineOf(TREE, "Gamma");
    const { text, line } = addEntry(TREE, gamma, true);
    expect(line).toBe(gamma + 1);
    expect(linesOf(text)[line]).toBe("*** ");
    expect(addEntry("* [ ] a", 0, false).text).toBe("* [ ] a\n* [ ]");
  });

  it("appends a first headline to a file", () => {
    expect(appendEntry("")).toMatchObject({ text: "* \n", line: 0 });
    expect(appendEntry("#+TITLE: x").text).toBe("#+TITLE: x\n* ");
  });
});

describe("setTitle, setPriority, setTags", () => {
  const mom = lineOf(TREE, "Call mom");

  it("rewrites only the part asked for", () => {
    expect(linesOf(setTitle(TREE, mom, "Call\ndad "))[mom]).toBe("** TODO [#B] Call dad :phone:family:");
    expect(linesOf(setPriority(TREE, mom, null))[mom]).toBe("** TODO Call mom :phone:family:");
    expect(linesOf(setPriority(TREE, lineOf(TREE, "Alpha"), "A"))[1]).toBe("** TODO [#A] Alpha");
    expect(linesOf(setTags(TREE, mom, []))[mom]).toBe("** TODO [#B] Call mom");
    expect(linesOf(setTags(TREE, lineOf(TREE, "Gamma"), ["x"]))[lineOf(TREE, "Gamma")]).toBe("** Gamma :x:");
    expect(changedLines(TREE, setTitle(TREE, mom, "Call dad"))).toHaveLength(1);
  });

  it("keeps aligned tags ending at their column", () => {
    const tagged = lineOf(TREE, "Tagged");
    const tags = linesOf(setTags(TREE, tagged, ["work", "home"]))[tagged];
    expect(tags.length).toBe(TAGGED.length);
    expect(tags.endsWith(" :work:home:")).toBe(true);
    const title = linesOf(setTitle(TREE, tagged, "Short"))[tagged];
    expect(title).toMatch(/^\* Short {2,}:work:$/);
    expect(title.length).toBe(TAGGED.length);
  });

  it("leaves the text alone when nothing changes", () => {
    expect(setPriority(TREE, mom, "B")).toBe(TREE);
    expect(setTags(TREE, mom, ["phone", "family"])).toBe(TREE);
    expect(setTitle(TREE, lineOf(TREE, "alpha text"), "x")).toBe(TREE);
  });
});

describe("knownTags and priorities", () => {
  it("collects used and declared tags", () => {
    expect(knownTags(parse(`#+TAGS: home(h) { @a @b }\n#+FILETAGS: :x:\n${TREE}`))).toEqual([
      "@a",
      "@b",
      "family",
      "home",
      "phone",
      "work",
      "x",
    ]);
  });

  it("reads #+PRIORITIES, defaulting to A-C", () => {
    expect(priorities(parse(TREE))).toEqual(["A", "B", "C"]);
    expect(priorities(parse("#+PRIORITIES: A E C"))).toEqual(["A", "B", "C", "D", "E"]);
    expect(priorities(parse("#+PRIORITIES: 1 3 2"))).toEqual(["1", "2", "3"]);
  });
});

describe("unfold", () => {
  it("opens the folded ancestors, and the headline itself when asked", () => {
    const doc = parse(TREE);
    const beta = lineOf(TREE, "Beta");
    const folds = { ...initialFolds(doc), headlines: { 0: "folded", [beta]: "folded" } } as ReturnType<typeof initialFolds>;
    expect(unfold(folds, doc, beta + 1).headlines).toMatchObject({ 0: "children", [beta]: "children" });
    expect(unfold(folds, doc, beta).headlines).toMatchObject({ 0: "children", [beta]: "folded" });
    expect(unfold(folds, doc, beta, true).headlines[beta]).toBe("children");
  });
});
