import { describe, expect, it } from "vitest";
import { setTodo, toggleCheckbox } from "./edit";
import { parseInline } from "./inline";
import { DOOM_SEQUENCES, todoSequences } from "./keywords";
import { flatten, parse, serialize } from "./parse";
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

  it("starts at the content when the edit isn't known, skipping #+ lines and blanks", () => {
    const { crumbs, lines } = snippet(doc, undefined, 2);
    expect(crumbs).toEqual([]);
    expect(lines.map((l) => l.text)).toEqual(["* Main tasks", "** HOLD Expand filesystem"]);
  });
});
