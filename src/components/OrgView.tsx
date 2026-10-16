import { Fragment, MouseEvent, useEffect, useRef, useState } from "react";
import { Icon } from "../icons/icon";
import { canShift, entryAt, subtreeEnd } from "../org/edit";
import { Folds, Visibility, cycle, isExpanded, isOpen, showsText, toggleOpen, visibilityOf } from "../org/folds";
import { Inline, parseInline } from "../org/inline";
import { isDone, keywordKind } from "../org/keywords";
import { Block, Headline, ListItem, OrgDocument, headlinePath } from "../org/parse";
import { DragState, useDragMove } from "../hooks/useDragMove";
import { Direction, SWIPE_PX, useRowGestures } from "../hooks/useRowGestures";
import { KeywordLabel } from "./KeywordLabel";

interface Context {
  doc: OrgDocument;
  folds: Folds;
  onFolds: (folds: Folds) => void;
  onTodo: (headline: Headline) => void;
  /** Long press on a headline */
  onEntryHold: (headline: Headline) => void;
  /** Swiping right demotes (1), left promotes (-1) */
  onShift: (headline: Headline, delta: Direction) => void;
  /** The headline whose title is being edited */
  renaming: number | null;
  /** The new title, or null to cancel */
  onRename: (headline: Headline, title: string | null) => void;
  /** The headline in move mode */
  moving: number | null;
  /** Dropping the moving entry before line `before`, at `level` */
  onDrop: (before: number, level: number) => void;
  /** The headline zoomed into */
  zoom: Headline | null;
  /** A breadcrumb: the headline to zoom to, null for the whole file */
  onZoom: (line: number | null) => void;
  /** The first breadcrumb */
  fileTitle: string;
  onAddEntry: () => void;
  onCheckbox: (line: number) => void;
  /** Long press on a list item */
  onItemHold: (line: number) => void;
  /** The list item whose text is being edited */
  editingItem: number | null;
  /** The item's new text, or null to cancel */
  onItemText: (line: number, text: string | null) => void;
  onOpenFile: (target: string) => void;
}

interface ViewContext extends Context {
  dragging: boolean;
  grip: ReturnType<typeof useDragMove>["grip"];
}

/** Headline colors by level, cycling like org-level-N faces */
export const LEVEL_COLORS = [
  "text-navajo-white",
  "text-desert-sand",
  "text-lilac",
  "text-periwinkle",
];

export const OrgView = (props: Context) => {
  const container = useRef<HTMLDivElement>(null);
  const root = props.zoom;
  const moving = props.moving !== null ? entryAt(props.doc, props.moving)?.headline ?? null : null;
  const drag = useDragMove({
    container,
    line: moving?.line ?? null,
    level: moving?.level ?? 1,
    zoomLevel: root?.level ?? 0,
    endLine: root ? subtreeEnd(props.doc, root) : props.doc.lines.length,
    onDrop: props.onDrop,
  });
  const ctx: ViewContext = { ...props, dragging: drag.dragging, grip: drag.grip };

  return (
    <div className="px-4 pb-24" ref={container}>
      {root ? (
        <>
          <Breadcrumbs root={root} ctx={ctx} />
          <HeadlineView headline={root} ctx={ctx} root />
        </>
      ) : (
        <>
          <Body blocks={props.doc.body} ctx={ctx} />
          {props.doc.headlines.map((h) => (
            <HeadlineView key={h.line} headline={h} ctx={ctx} />
          ))}
        </>
      )}
      <button
        className="flex items-center gap-2 mt-3 py-2 text-sm text-lavender-grey cursor-pointer active:text-navajo-white"
        onClick={props.onAddEntry}
      >
        <Icon title="plus_lg" />
        New entry
      </button>
      {moving && <DragOverlay subscribe={drag.subscribe} headline={moving} doc={props.doc} />}
    </div>
  );
};

const HeadlineView = ({ headline: h, ctx, root = false }: { headline: Headline; ctx: ViewContext; root?: boolean }) => {
  const isMoving = ctx.moving === h.line;
  const renaming = ctx.renaming === h.line;
  // The zoom root always shows what's below it; an entry being dragged doesn't
  const visibility: Visibility = root
    ? "subtree"
    : isMoving && ctx.dragging
      ? "folded"
      : visibilityOf(ctx.folds, h);
  const foldable = !root && (h.children.length > 0 || h.body.some((b) => b.kind !== "blank"));
  const done = !!h.keyword && isDone(ctx.doc.sequences, h.keyword);
  const color = done ? "text-lavender-grey/50" : LEVEL_COLORS[(h.level - 1) % LEVEL_COLORS.length];
  const toggle = () => foldable && ctx.onFolds(cycle(ctx.folds, h));
  const allowed = (direction: Direction) => !root && canShift(ctx.doc, h.line, direction);
  const gestures = useRowGestures({
    onHold: () => ctx.onEntryHold(h),
    onSwipe: root ? undefined : (direction) => ctx.onShift(h, direction),
    canSwipe: allowed,
  });

  // Moved by the arrows or a drop: keep it in sight
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isMoving && !ctx.dragging) row.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isMoving]);

  const keyword = h.keyword && (
    <KeywordLabel
      className="mr-2 align-[0.1em]"
      keyword={h.keyword}
      kind={keywordKind(ctx.doc.sequences, h.keyword)}
      onClick={(e) => {
        e.stopPropagation();
        ctx.onTodo(h);
      }}
    />
  );
  const priority = h.priority && (
    <span className={`mr-2 ${done ? "text-dusty-rose/50" : "text-dusty-rose"}`}>[#{h.priority}]</span>
  );
  const size = root ? "text-2xl" : h.level === 1 ? "text-lg" : "";

  return (
    <div className={h.level > 1 && !root ? "pl-3" : ""}>
      <div className={`relative -mx-1 overflow-x-clip rounded-md ${root ? "py-2" : ""}`}>
        {Math.abs(gestures.dx) > 16 && <SwipeHint dx={gestures.dx} allowed={allowed(gestures.dx > 0 ? 1 : -1)} />}
        <div
          ref={row}
          data-headline={root ? undefined : h.line}
          data-level={h.level}
          className={`flex items-start gap-1 py-1 px-1 rounded-md cursor-pointer select-none [-webkit-touch-callout:none] touch-pan-y transition-[background-color,transform,opacity] ${
            gestures.pressing
              ? "bg-dusty-grape/40 duration-500"
              : isMoving
                ? `bg-dusty-grape/60 duration-150 ${ctx.dragging ? "opacity-50" : ""}`
                : "duration-150"
          }`}
          style={gestures.dx ? { transform: `translateX(${gestures.dx}px)`, transitionDuration: "0ms" } : undefined}
          onClick={renaming ? undefined : toggle}
          {...(renaming ? {} : gestures.handlers)}
        >
          {!root && (
            <span className="text-lavender-grey w-4 pt-1 shrink-0">
              {foldable && <Icon title={isExpanded(ctx.folds, h) ? "chevron_down" : "chevron_right"} />}
            </span>
          )}
          {renaming ? (
            <div className={`flex-1 flex items-start font-bold ${size} ${color}`}>
              {keyword}
              {priority}
              <TitleField initial={h.title} onDone={(title) => ctx.onRename(h, title)} />
            </div>
          ) : (
            <div className={`flex-1 font-bold wrap-break-word ${size} ${root ? "text-navajo-white" : color}`}>
              {keyword}
              {priority}
              <InlineText text={h.title} onOpenFile={ctx.onOpenFile} />
            </div>
          )}
          {h.tags.length > 0 && (
            <span className="text-xs text-lavender-grey pt-1">:{h.tags.join(":")}:</span>
          )}
          {isMoving && !renaming && (
            <span
              className="text-navajo-white -my-1 px-2 py-2 touch-none cursor-grab"
              title="Drag to move"
              {...ctx.grip}
            >
              <Icon title="grip_vertical" width={18} height={18} />
            </span>
          )}
        </div>
      </div>
      {showsText(visibility) && (
        <div className={root ? "" : "pl-5"}>
          <Body blocks={h.body} ctx={ctx} />
        </div>
      )}
      {visibility !== "folded" &&
        h.children.map((c) => <HeadlineView key={c.line} headline={c} ctx={ctx} />)}
    </div>
  );
};

/** Shows behind a row being swiped what letting go does */
const SwipeHint = ({ dx, allowed }: { dx: number; allowed: boolean }) => (
  <div
    className={`absolute inset-y-0 flex items-center px-2 ${dx > 0 ? "left-0" : "right-0"} ${
      !allowed ? "text-lavender-grey/30" : Math.abs(dx) >= SWIPE_PX ? "text-navajo-white" : "text-lavender-grey"
    }`}
  >
    <Icon title={dx > 0 ? "indent" : "unindent"} width={18} height={18} />
  </div>
);

/** Editing a title in place: Enter or leaving the field saves, Escape cancels */
const TitleField = ({
  initial,
  placeholder = "Title",
  onDone,
}: {
  initial: string;
  placeholder?: string;
  onDone: (title: string | null) => void;
}) => {
  const field = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);
  const finish = (title: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(title);
  };
  const fit = () => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    fit();
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.scrollIntoView({ block: "center" });
  }, []);

  return (
    <textarea
      ref={field}
      defaultValue={initial}
      rows={1}
      enterKeyHint="done"
      placeholder={placeholder}
      className="flex-1 min-w-0 resize-none bg-jet-black rounded px-1 outline-none select-text placeholder:text-lavender-grey/60"
      onInput={fit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(e.currentTarget.value);
        } else if (e.key === "Escape") {
          finish(null);
        }
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
};

/** Zoomed in: the way back up, each step tappable */
const Breadcrumbs = ({ root, ctx }: { root: Headline; ctx: ViewContext }) => (
  <nav className="flex flex-wrap items-center gap-x-1 text-sm text-lavender-grey pt-1">
    <Crumb onClick={() => ctx.onZoom(null)}>{ctx.fileTitle}</Crumb>
    {headlinePath(ctx.doc.headlines, root.line)
      .slice(0, -1)
      .map((h) => (
        <Fragment key={h.line}>
          <Icon title="chevron_right" width={10} height={10} />
          <Crumb onClick={() => ctx.onZoom(h.line)}>
            <InlineText text={h.title} />
          </Crumb>
        </Fragment>
      ))}
  </nav>
);

const Crumb = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
  <button className="truncate max-w-[45vw] py-1 cursor-pointer active:text-navajo-white" onClick={onClick}>
    {children}
  </button>
);

/** While dragging: where the entry would land, and the entry under the finger */
const DragOverlay = ({
  subscribe,
  headline,
  doc,
}: {
  subscribe: ReturnType<typeof useDragMove>["subscribe"];
  headline: Headline;
  doc: OrgDocument;
}) => {
  const [state, setState] = useState<DragState | null>(null);
  useEffect(() => subscribe(setState), [subscribe]);
  if (!state) return null;
  return (
    <>
      <div
        className="fixed h-0.5 bg-navajo-white rounded-full pointer-events-none z-5"
        style={{ top: state.lineY - 1, left: state.lineX, right: 16 }}
      >
        <div className="absolute -left-1 -top-0.75 w-2 h-2 rounded-full bg-navajo-white" />
      </div>
      <div
        className="fixed max-w-[70vw] truncate rounded-lg bg-dusty-grape shadow-lg px-3 py-1 font-bold text-navajo-white pointer-events-none z-5"
        style={{ top: state.y - 56, left: state.lineX }}
      >
        {headline.keyword && (
          <KeywordLabel
            className="mr-2"
            keyword={headline.keyword}
            kind={keywordKind(doc.sequences, headline.keyword)}
          />
        )}
        {headline.title}
      </div>
    </>
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

    case "item":
      return <ItemView line={block.line} item={block.item} ctx={ctx} />;

    case "text":
      return (
        <div className="wrap-break-word" style={{ paddingLeft: `${block.indent}ch` }}>
          <InlineText text={block.text} onOpenFile={ctx.onOpenFile} />
        </div>
      );
  }
};

/** A list item: tap its box to check it, hold it for what else can be done */
const ItemView = ({ line, item, ctx }: { line: number; item: ListItem; ctx: Context }) => {
  const editing = ctx.editingItem === line;
  const hold = useRowGestures({ onHold: () => ctx.onItemHold(line) });
  const checked = item.checkbox === "X";
  return (
    <div
      className={`flex gap-2 items-start -mx-1 px-1 rounded-md select-none [-webkit-touch-callout:none] transition-colors ${
        hold.pressing ? "bg-dusty-grape/40 duration-500" : "duration-150"
      }`}
      style={{ paddingLeft: `calc(${item.indent}ch + 0.25rem)` }}
      // A click handler makes the row a tap target of its own. Without one,
      // Chromium's touch adjustment moves presses near a headline (like on
      // the first item under it) onto that headline instead.
      onClick={() => {}}
      {...(editing ? {} : hold.handlers)}
    >
      <span className="text-lavender-grey">{/\d/.test(item.bullet) ? item.bullet : "•"}</span>
      {item.checkbox !== null && (
        <button className="text-amethyst-smoke pt-1 cursor-pointer" onClick={() => ctx.onCheckbox(line)}>
          <Icon title={checked ? "check_square" : item.checkbox === "-" ? "dash_square" : "square"} />
        </button>
      )}
      {editing ? (
        <TitleField initial={item.text} placeholder="Item" onDone={(text) => ctx.onItemText(line, text)} />
      ) : (
        <span className={`flex-1 wrap-break-word ${checked ? "text-lavender-grey" : ""}`}>
          <InlineText text={item.text} onOpenFile={ctx.onOpenFile} />
        </span>
      )}
    </div>
  );
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
