import { useEffect, useState } from "react";
import { Button, Chip, DANGER, SECONDARY } from "../fragments/Button";
import { Column, Input, Output } from "../fragments/Elements";
import { Modal } from "../fragments/Modal";
import { Sheet, SheetRow } from "../fragments/Sheet";
import { useLast } from "../hooks/useLast";
import { Icon } from "../icons/icon";
import { deleteEntry } from "../org/edit";
import { TodoSequence, isBoxKeyword, keywordKind, pickerGroups, suggestedState } from "../org/keywords";
import { Headline, flatten } from "../org/parse";
import { KeywordLabel, keywordButtonColors } from "./KeywordLabel";
import { InlineText } from "./OrgView";

export type EntryAction =
  | "rename"
  | "state"
  | "priority"
  | "tags"
  | "addBelow"
  | "addChild"
  | "move"
  | "zoom"
  | "text"
  | "delete";

const EDITS: { action: EntryAction; label: string; icon: React.ComponentProps<typeof Icon>["title"] }[] = [
  { action: "rename", label: "Rename", icon: "pencil" },
  { action: "state", label: "State", icon: "check2_square" },
  { action: "priority", label: "Priority", icon: "flag" },
  { action: "tags", label: "Tags", icon: "tags" },
];

const STRUCTURE: { action: EntryAction; label: string; icon: React.ComponentProps<typeof Icon>["title"] }[] = [
  { action: "addBelow", label: "Add entry below", icon: "plus_lg" },
  { action: "addChild", label: "Add sub-entry", icon: "arrow_return_right" },
  { action: "move", label: "Move", icon: "arrows_move" },
  { action: "zoom", label: "Zoom in", icon: "zoom_in" },
  { action: "text", label: "Edit as text", icon: "body_text" },
];

/** What a long press on a headline offers */
export const EntrySheet = ({
  headline,
  sequences,
  hidden = [],
  onAction,
  onClose,
}: {
  headline: Headline | null;
  sequences: TodoSequence[];
  /** Actions that don't apply here */
  hidden?: EntryAction[];
  onAction: (action: EntryAction, headline: Headline) => void;
  onClose: () => void;
}) => {
  const shown = useLast(headline);
  const act = (action: EntryAction) => shown && onAction(action, shown);

  return (
    <Sheet show={!!headline} onClose={onClose}>
      {shown && (
        <div className="font-bold text-navajo-white px-1 pb-3 line-clamp-2 wrap-break-word">
          {shown.keyword && (
            <KeywordLabel
              className="mr-2 align-[0.1em]"
              keyword={shown.keyword}
              kind={keywordKind(sequences, shown.keyword)}
            />
          )}
          {shown.priority && <span className="mr-2 text-dusty-rose">[#{shown.priority}]</span>}
          <InlineText text={shown.title} />
        </div>
      )}
      <div className="grid grid-cols-4 gap-2 mb-2">
        {EDITS.map(({ action, label, icon }) => (
          <button
            key={action}
            className="flex flex-col items-center gap-1 py-3 rounded-xl bg-jet-black text-sm text-desert-sand cursor-pointer active:bg-dusty-grape/60"
            onClick={() => act(action)}
          >
            <Icon title={icon} width={20} height={20} />
            {label}
          </button>
        ))}
      </div>
      {STRUCTURE.filter(({ action }) => !hidden.includes(action)).map(({ action, label, icon }) => (
        <SheetRow key={action} onClick={() => act(action)}>
          <Icon title={icon} width={18} height={18} />
          {label}
        </SheetRow>
      ))}
      <SheetRow className="text-dusty-rose" onClick={() => act("delete")}>
        <Icon title="trash3" width={18} height={18} />
        Delete…
      </SheetRow>
    </Sheet>
  );
};

/** Org tags are letters, digits, _, @, # and % */
const cleanTag = (tag: string) => tag.trim().replace(/^:+|:+$/g, "").replace(/[^\w@#%]+/g, "_");

/** org-set-tags-command: the entry's tags, others from the file to add */
export const TagPicker = ({
  headline,
  known,
  onSave,
  onClose,
}: {
  headline: Headline | null;
  known: string[];
  onSave: (tags: string[]) => void;
  onClose: () => void;
}) => {
  const shown = useLast(headline);
  const [tags, setTags] = useState<string[]>([]);
  const [input, setInput] = useState("");
  useEffect(() => {
    if (headline) {
      setTags(headline.tags);
      setInput("");
    }
  }, [headline]);

  const add = (tag: string) => {
    const clean = cleanTag(tag);
    if (clean && !tags.includes(clean)) setTags([...tags, clean]);
    setInput("");
  };
  const typed = cleanTag(input).toLowerCase();
  const suggestions = known.filter((t) => !tags.includes(t) && t.toLowerCase().includes(typed));

  return (
    <Modal
      title="Tags"
      description={shown?.title}
      show={!!headline}
      onClose={onClose}
      onSave={() => onSave(input.trim() ? [...new Set([...tags, cleanTag(input)])] : tags)}
    >
      <Column className="w-[70vw] gap-3">
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && <span className="text-amethyst-smoke text-sm italic">No tags</span>}
          {tags.map((tag) => (
            <Chip key={tag} className="flex items-center gap-1" onClick={() => setTags(tags.filter((t) => t !== tag))}>
              {tag}
              <Icon title="x_lg" width={12} height={12} />
            </Chip>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add(input);
          }}
        >
          <Input
            className="w-full"
            placeholder="New tag"
            enterKeyHint="done"
            value={input}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
          />
        </form>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((tag) => (
              <Chip key={tag} className="bg-jet-black font-normal" onClick={() => add(tag)}>
                + {tag}
              </Chip>
            ))}
          </div>
        )}
      </Column>
    </Modal>
  );
};

/** org-priority */
export const PriorityPicker = ({
  headline,
  priorities,
  onPick,
  onClose,
}: {
  headline: Headline | null;
  priorities: string[];
  onPick: (priority: string | null) => void;
  onClose: () => void;
}) => {
  const shown = useLast(headline);
  return (
    <Modal
      title="Priority"
      description={shown?.title}
      show={!!headline}
      onClose={onClose}
      onSave={() => onPick(null)}
      saveLabel="Clear priority"
    >
      <div className="flex flex-wrap justify-center gap-2 w-[70vw]">
        {priorities.map((p) => (
          <button
            key={p}
            className="font-mono font-bold text-dusty-rose bg-jet-black rounded-lg px-3 py-2 cursor-pointer active:brightness-125"
            onClick={() => onPick(p)}
          >
            {p === shown?.priority ? "✓ " : ""}[#{p}]
          </button>
        ))}
      </div>
    </Modal>
  );
};

/**
 * org-todo: the states of the headline's own kind first (open ones, then
 * done ones), the others below. The button at the bottom right sets the
 * state it most likely moves to next.
 */
export const StatePicker = ({
  headline,
  sequences,
  onPick,
  onClose,
}: {
  headline: Headline | null;
  sequences: TodoSequence[];
  onPick: (keyword: string | null) => void;
  onClose: () => void;
}) => {
  const shown = useLast(headline);
  const current = shown?.keyword ?? null;
  const groups = pickerGroups(sequences, current);
  const next = suggestedState(sequences, current);

  const group = (label: string, keywords: string[], size: "sm" | "lg") =>
    keywords.length > 0 && (
      <div>
        <div className="text-xs text-amethyst-smoke mb-1">{label}</div>
        <div className="flex flex-wrap gap-2">
          {keywords.map((keyword) => (
            <KeywordLabel
              key={keyword}
              keyword={keyword}
              kind={keywordKind(sequences, keyword)}
              size={size}
              choice
              current={keyword === current}
              onClick={() => onPick(keyword)}
            />
          ))}
        </div>
      </div>
    );

  return (
    <Modal
      title="Set state"
      description={shown?.title}
      show={!!headline}
      onClose={onClose}
      beforeSave={
        current !== null && (
          <Button className={SECONDARY} onClick={() => onPick(null)}>
            Clear state
          </Button>
        )
      }
      onSave={next ? () => onPick(next) : undefined}
      saveLabel={next ?? undefined}
      saveClassName={next ? `font-mono ${keywordButtonColors(next, keywordKind(sequences, next))}` : undefined}
    >
      <Column className="w-[70vw] gap-3">
        {group("Open", groups.open, "lg")}
        {group("Done", groups.done, "lg")}
        {groups.other.length > 0 && (
          <>
            <hr className="text-periwinkle/30" />
            {group(current !== null && isBoxKeyword(current) ? "Keyword states" : "Checkbox states", groups.other, "sm")}
          </>
        )}
      </Column>
    </Modal>
  );
};

const PREVIEW_LINES = 8;

/** Confirms deleting a headline with its body and sub-entries */
export const DeleteEntryModal = ({
  headline,
  text,
  file,
  onDelete,
  onClose,
}: {
  headline: Headline | null;
  text: string;
  file: string;
  onDelete: (headline: Headline) => void;
  onClose: () => void;
}) => {
  const shown = useLast(headline);
  const removed = shown ? deleteEntry(text, shown.line).removed : 0;
  const lines = shown ? text.split(/\r?\n/).slice(shown.line, shown.line + removed) : [];
  const subEntries = shown ? flatten(shown.children).length : 0;
  const what = subEntries === 0 ? "This entry" : `This entry and its ${subEntries} sub-entr${subEntries === 1 ? "y" : "ies"}`;

  return (
    <Modal
      title="Delete entry?"
      description={`${what} will be removed from ${file}.`}
      show={!!headline}
      onClose={onClose}
      footer={
        <Button className={`${DANGER} mr-auto`} onClick={() => shown && onDelete(shown)}>
          Delete
        </Button>
      }
    >
      <Column className="w-[70vw]">
        <Output>
          {lines.slice(0, PREVIEW_LINES).join("\n")}
          {lines.length > PREVIEW_LINES && `\n… ${lines.length - PREVIEW_LINES} more lines`}
        </Output>
      </Column>
    </Modal>
  );
};
