import { useRef } from "react";
import { Button, DANGER } from "../fragments/Button";
import { Column, Output } from "../fragments/Elements";
import { Modal } from "../fragments/Modal";
import { deleteEntry } from "../org/edit";
import { TodoSequence, isBoxKeyword, keywordKind, pickerGroups } from "../org/keywords";
import { Headline, flatten } from "../org/parse";
import { KeywordLabel } from "./KeywordLabel";

/** Modals stay mounted for their animation: keep showing the last headline while closing */
const useLast = <T,>(value: T | null) => {
  const last = useRef(value);
  if (value !== null) last.current = value;
  return last.current;
};

/**
 * org-todo: the states of the headline's own kind first (open ones, then
 * done ones), the others below.
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
      onSave={() => onPick(null)}
      saveLabel="Clear state"
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
