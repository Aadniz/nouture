import { useMemo } from "react";
import { Icon } from "../icons/icon";
import { TodoSequence, allKeywords, isDone, keywordKind } from "../org/keywords";
import { parse, parseHeadline, parseItem } from "../org/parse";
import { snippet } from "../org/snippet";
import { KeywordLabel } from "./KeywordLabel";
import { InlineText, LEVEL_COLORS } from "./OrgView";

const HEADLINE = /^(\*+)\s(.*)$/;
/** #+KEYWORD lines, comments, drawers and planning lines */
const META = /^\s*(?:#|:[\w-]+:|(?:SCHEDULED|DEADLINE|CLOSED):)/;

/**
 * A few lines of a note, styled like the note view. The lines of its last
 * edit get an apricot bar; the headlines above them show as a breadcrumb.
 */
export const OrgSnippet = ({
  text,
  edited,
  maxLines,
}: {
  text: string;
  edited?: { start: number; end: number };
  maxLines: number;
}) => {
  const doc = useMemo(() => parse(text), [text]);
  const keywords = useMemo(() => allKeywords(doc.sequences), [doc]);
  const { crumbs, lines } = snippet(doc, edited, maxLines);

  return (
    <div className="text-xs leading-snug">
      {crumbs.length > 0 && (
        <div className="text-lavender-grey italic truncate mb-0.5">{crumbs.join(" › ")}</div>
      )}
      {lines.map((l) => (
        <div
          key={l.line}
          className={`truncate border-l-2 pl-1 ${l.edited ? "border-apricot" : "border-transparent"}`}
        >
          <Line text={l.text} keywords={keywords} sequences={doc.sequences} />
        </div>
      ))}
    </div>
  );
};

const Line = ({
  text,
  keywords,
  sequences,
}: {
  text: string;
  keywords: string[];
  sequences: TodoSequence[];
}) => {
  const headline = HEADLINE.exec(text);
  if (headline) {
    const h = parseHeadline(0, headline[1].length, headline[2], keywords);
    const done = !!h.keyword && isDone(sequences, h.keyword);
    const color = done ? "text-lavender-grey/50" : LEVEL_COLORS[(h.level - 1) % LEVEL_COLORS.length];
    return (
      <span className={`font-bold ${color}`}>
        {h.keyword && (
          <KeywordLabel className="mr-1" size="xs" keyword={h.keyword} kind={keywordKind(sequences, h.keyword)} />
        )}
        {h.priority && <span className="mr-1 text-dusty-rose">[#{h.priority}]</span>}
        <InlineText text={h.title} />
      </span>
    );
  }

  const item = parseItem(text);
  if (item) {
    const checked = item.checkbox === "X";
    return (
      <span className={checked ? "text-lavender-grey" : ""} style={{ paddingLeft: `${item.indent}ch` }}>
        <span className="text-amethyst-smoke mr-1 inline-block align-[-1px]">
          {item.checkbox === null ? (
            /\d/.test(item.bullet) ? item.bullet : "•"
          ) : (
            <Icon
              title={checked ? "check_square" : item.checkbox === "-" ? "dash_square" : "square"}
              width={10}
              height={10}
            />
          )}
        </span>
        <InlineText text={item.text} />
      </span>
    );
  }

  if (META.test(text)) return <span className="text-lavender-grey italic">{text.trim()}</span>;
  return <InlineText text={text.trim()} />;
};
