import { MouseEvent } from "react";
import { Icon } from "../icons/icon";
import { Folds, cycle, isExpanded, isOpen, showsText, toggleOpen, visibilityOf } from "../org/folds";
import { Inline, parseInline } from "../org/inline";
import { isDone, keywordKind } from "../org/keywords";
import { Block, Headline, OrgDocument } from "../org/parse";
import { useLongPress } from "../hooks/useLongPress";
import { KeywordLabel } from "./KeywordLabel";

interface Context {
  doc: OrgDocument;
  folds: Folds;
  onFolds: (folds: Folds) => void;
  onTodo: (headline: Headline) => void;
  /** Long press on a headline */
  onEntryHold: (headline: Headline) => void;
  onCheckbox: (line: number) => void;
  onOpenFile: (target: string) => void;
}

/** Headline colors by level, cycling like org-level-N faces */
export const LEVEL_COLORS = [
  "text-navajo-white",
  "text-desert-sand",
  "text-lilac",
  "text-periwinkle",
];

export const OrgView = (ctx: Context) => (
  <div className="px-4 pb-8">
    <Body blocks={ctx.doc.body} ctx={ctx} />
    {ctx.doc.headlines.map((h) => (
      <HeadlineView key={h.line} headline={h} ctx={ctx} />
    ))}
  </div>
);

const HeadlineView = ({ headline: h, ctx }: { headline: Headline; ctx: Context }) => {
  const visibility = visibilityOf(ctx.folds, h);
  const foldable = h.children.length > 0 || h.body.some((b) => b.kind !== "blank");
  const done = !!h.keyword && isDone(ctx.doc.sequences, h.keyword);
  const color = done ? "text-lavender-grey/50" : LEVEL_COLORS[(h.level - 1) % LEVEL_COLORS.length];
  const toggle = () => foldable && ctx.onFolds(cycle(ctx.folds, h));
  const hold = useLongPress(() => ctx.onEntryHold(h));

  return (
    <div className={h.level > 1 ? "pl-3" : ""}>
      <div
        className={`flex items-start gap-1 py-1 -mx-1 px-1 rounded-md cursor-pointer select-none [-webkit-touch-callout:none] transition-colors ${
          hold.pressing ? "bg-dusty-grape/40 duration-500" : "duration-150"
        }`}
        onClick={toggle}
        {...hold.handlers}
      >
        <span className="text-lavender-grey w-4 pt-1 shrink-0">
          {foldable && (
            <Icon title={isExpanded(ctx.folds, h) ? "chevron_down" : "chevron_right"} />
          )}
        </span>
        <div className={`flex-1 font-bold wrap-break-word ${h.level === 1 ? "text-lg" : ""} ${color}`}>
          {h.keyword && (
            <KeywordLabel
              className="mr-2 align-[0.1em]"
              keyword={h.keyword}
              kind={keywordKind(ctx.doc.sequences, h.keyword)}
              onClick={(e) => {
                e.stopPropagation();
                ctx.onTodo(h);
              }}
            />
          )}
          {h.priority && (
            <span className={`mr-2 ${done ? "text-dusty-rose/50" : "text-dusty-rose"}`}>[#{h.priority}]</span>
          )}
          <InlineText text={h.title} onOpenFile={ctx.onOpenFile} />
        </div>
        {h.tags.length > 0 && (
          <span className="text-xs text-lavender-grey pt-1">:{h.tags.join(":")}:</span>
        )}
      </div>
      {showsText(visibility) && (
        <div className="pl-5">
          <Body blocks={h.body} ctx={ctx} />
        </div>
      )}
      {visibility !== "folded" &&
        h.children.map((c) => <HeadlineView key={c.line} headline={c} ctx={ctx} />)}
    </div>
  );
};

const Body = ({ blocks, ctx }: { blocks: Block[]; ctx: Context }) => (
  <>
    {blocks.map((block) => (
      <BlockView key={block.line} block={block} ctx={ctx} />
    ))}
  </>
);

const BlockView = ({ block, ctx }: { block: Block; ctx: Context }) => {
  switch (block.kind) {
    case "blank":
      return <div className="h-3" />;

    case "keyword":
      return block.key.toLowerCase() === "title" ? (
        <h1 className="text-navajo-white text-2xl font-bold py-2">
          <InlineText text={block.value} onOpenFile={ctx.onOpenFile} />
        </h1>
      ) : (
        <Meta>
          #+{block.key}: {block.value}
        </Meta>
      );

    case "planning":
      return (
        <Meta>
          <InlineText text={block.text} onOpenFile={ctx.onOpenFile} />
        </Meta>
      );

    case "comment":
      return <Meta>{block.text}</Meta>;

    case "drawer":
    case "block": {
      const open = isOpen(ctx.folds, block.line, block.kind);
      const header =
        block.kind === "drawer"
          ? `:${block.name}:`
          : `#+BEGIN_${block.type}${block.params ? " " + block.params : ""}`;
      return (
        <div>
          <button
            className="text-lavender-grey italic text-sm cursor-pointer"
            onClick={() => ctx.onFolds(toggleOpen(ctx.folds, block.line, block.kind))}
          >
            {header}
            {open ? "" : "…"}
          </button>
          {open && (
            <pre className="font-mono text-xs bg-jet-black text-desert-sand rounded-lg p-2 overflow-x-auto whitespace-pre">
              {block.lines.join("\n")}
            </pre>
          )}
        </div>
      );
    }

    case "table":
      return (
        <pre className="font-mono text-xs text-desert-sand overflow-x-auto whitespace-pre">
          {block.lines.join("\n")}
        </pre>
      );

    case "item": {
      const { item } = block;
      const checked = item.checkbox === "X";
      return (
        <div className="flex gap-2 items-start" style={{ paddingLeft: `${item.indent}ch` }}>
          <span className="text-lavender-grey">{/\d/.test(item.bullet) ? item.bullet : "•"}</span>
          {item.checkbox !== null && (
            <button
              className="text-amethyst-smoke pt-1 cursor-pointer"
              onClick={() => ctx.onCheckbox(block.line)}
            >
              <Icon
                title={checked ? "check_square" : item.checkbox === "-" ? "dash_square" : "square"}
              />
            </button>
          )}
          <span className={`flex-1 wrap-break-word ${checked ? "text-lavender-grey" : ""}`}>
            <InlineText text={item.text} onOpenFile={ctx.onOpenFile} />
          </span>
        </div>
      );
    }

    case "text":
      return (
        <div className="wrap-break-word" style={{ paddingLeft: `${block.indent}ch` }}>
          <InlineText text={block.text} onOpenFile={ctx.onOpenFile} />
        </div>
      );
  }
};

const Meta = ({ children }: { children: React.ReactNode }) => (
  <div className="text-lavender-grey italic text-sm wrap-break-word">{children}</div>
);

/** Org markup in a line; without onOpenFile, links are shown but not followed */
export const InlineText = ({
  text,
  onOpenFile,
}: {
  text: string;
  onOpenFile?: (target: string) => void;
}) => (
  <>
    {parseInline(text).map((token, i) => (
      <InlineView key={i} token={token} onOpenFile={onOpenFile} />
    ))}
  </>
);

const InlineView = ({
  token,
  onOpenFile,
}: {
  token: Inline;
  onOpenFile?: (target: string) => void;
}) => {
  switch (token.kind) {
    case "text":
      return <>{token.text}</>;
    case "link": {
      if (!onOpenFile) return <span className="text-periwinkle underline">{token.text}</span>;
      const file = fileTarget(token.target);
      const href = file ? undefined : webTarget(token.target);
      const open = (e: MouseEvent) => {
        e.stopPropagation();
        if (file) {
          e.preventDefault();
          onOpenFile(file);
        }
      };
      return (
        <a
          className="text-periwinkle underline break-all"
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={open}
        >
          {token.text}
        </a>
      );
    }
    case "timestamp":
      return <span className="text-lilac">{token.text}</span>;
    case "cookie":
      return (
        <span className={token.complete ? "text-lavender-grey" : "text-amethyst-smoke"}>
          {token.text}
        </span>
      );
    case "bold":
      return <b>{token.text}</b>;
    case "italic":
      return <i>{token.text}</i>;
    case "underline":
      return <u>{token.text}</u>;
    case "strike":
      return <s>{token.text}</s>;
    case "code":
    case "verbatim":
      return (
        <code className="font-mono text-desert-sand bg-jet-black rounded px-1">
          {token.text}
        </code>
      );
  }
};

/** "file:notes.org::*Heading" or a bare "notes.org" -> the file part */
const fileTarget = (target: string) => {
  const path = target.replace(/^file:/, "").replace(/::.*$/, "");
  return target.startsWith("file:") || /\.org(_archive)?$/.test(path) ? path : null;
};

/** Org allows links like "www.example.com" without a scheme */
const webTarget = (target: string) =>
  /^[a-z][a-z0-9+.-]*:/i.test(target) ? target : `https://${target}`;
