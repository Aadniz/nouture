export type Inline =
  | { kind: "text"; text: string }
  | { kind: "link"; target: string; text: string }
  | { kind: "timestamp"; text: string }
  | { kind: "cookie"; text: string; complete: boolean }
  | { kind: Emphasis; text: string };

export type Emphasis =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "verbatim";

const EMPHASIS: Record<string, Emphasis> = {
  "*": "bold",
  "/": "italic",
  _: "underline",
  "+": "strike",
  "~": "code",
  "=": "verbatim",
};

const INLINE = new RegExp(
  [
    String.raw`\[\[(?<target>[^\]]+)\](?:\[(?<desc>[^\]]+)\])?\]`,
    String.raw`(?<ts>[<\[]\d{4}-\d{2}-\d{2}[^>\]\n]*[>\]])`,
    String.raw`(?<cookie>\[\d*\/\d*\]|\[\d*%\])`,
    String.raw`(?<url>\b(?:https?|ftp):\/\/[^\s<>\[\]]*[^\s<>\[\].,;:!?'")])`,
    // org's emphasis rules, simplified: markers hug non-space text
    String.raw`(?<=^|[\s('"{\-])(?<em>[*\/_=~+])(?<emtext>\S|\S.*?\S)\k<em>(?=$|[\s\-.,;:!?'")}\]])`,
  ].join("|"),
  "g"
);

export const parseInline = (text: string): Inline[] => {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const groups = match.groups!;
    if (match.index > last) out.push({ kind: "text", text: text.slice(last, match.index) });
    last = match.index + match[0].length;

    if (groups.target) {
      out.push({ kind: "link", target: groups.target, text: groups.desc ?? groups.target });
    } else if (groups.ts) {
      out.push({ kind: "timestamp", text: groups.ts });
    } else if (groups.cookie) {
      out.push({ kind: "cookie", text: groups.cookie, complete: isComplete(groups.cookie) });
    } else if (groups.url) {
      out.push({ kind: "link", target: groups.url, text: groups.url });
    } else {
      out.push({ kind: EMPHASIS[groups.em], text: groups.emtext });
    }
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
};

const isComplete = (cookie: string) => {
  const ratio = /\[(\d+)\/(\d+)\]/.exec(cookie);
  if (ratio) return ratio[1] === ratio[2] && ratio[2] !== "0";
  return cookie === "[100%]";
};
