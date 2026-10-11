import { useEffect, useRef, useState } from "react";
import { Button, DANGER } from "../fragments/Button";
import { Column, Input, Label } from "../fragments/Elements";
import { Modal } from "../fragments/Modal";
import { Sheet, SheetRow } from "../fragments/Sheet";
import { useLast } from "../hooks/useLast";
import { Icon } from "../icons/icon";
import { Notes } from "../plugins/notes";
import { fileName, useNotesStore } from "../stores/notesStore";
import { profileForPath, useUnisonStore } from "../stores/unisonStore";

/**
 * What a long press on a note offers. Deleting one takes hiding it first,
 * so a note is never lost to a slip of the thumb.
 */
export const NoteActions = ({
  path,
  onClose,
  onChanged,
}: {
  path: string | null;
  onClose: () => void;
  /** After a rename or a delete: the notes need listing again */
  onChanged: () => void;
}) => {
  const shown = useLast(path);
  const hidden = useNotesStore((s) => !!shown && s.hidden.includes(shown));
  const pinned = useNotesStore((s) => !!shown && s.pinned.includes(shown));
  const setHidden = useNotesStore((s) => s.setHidden);
  const setPinned = useNotesStore((s) => s.setPinned);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const act = (run: (path: string) => void) => () => {
    if (shown) run(shown);
    onClose();
  };
  const folder = shown ? shown.slice(0, shown.lastIndexOf("/")) : "";

  return (
    <>
      <Sheet show={!!path} onClose={onClose}>
        {shown && (
          <div className="px-1 pb-3">
            <div className="font-bold text-navajo-white truncate">{fileName(shown)}</div>
            <div className="text-xs text-amethyst-smoke truncate">{folder}</div>
          </div>
        )}
        <SheetRow onClick={act((p) => setPinned(p, !pinned))}>
          <Icon title={pinned ? "pin_angle" : "pin_angle_fill"} width={18} height={18} />
          {pinned ? "Unpin from the front page" : "Pin to the front page"}
        </SheetRow>
        <SheetRow onClick={act(setRenaming)}>
          <Icon title="input_cursor_text" width={18} height={18} />
          Rename…
        </SheetRow>
        <SheetRow onClick={act((p) => setHidden(p, !hidden))}>
          <Icon title={hidden ? "eye" : "eye_slash"} width={18} height={18} />
          {hidden ? "Show on the front page" : "Hide from the front page"}
        </SheetRow>
        {hidden && (
          <SheetRow className="text-dusty-rose" onClick={act(setDeleting)}>
            <Icon title="trash3" width={18} height={18} />
            Delete…
          </SheetRow>
        )}
      </Sheet>

      <RenameNoteModal
        path={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={() => {
          setRenaming(null);
          onChanged();
        }}
      />
      <DeleteNoteModal
        path={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          onChanged();
        }}
      />
    </>
  );
};

const RenameNoteModal = ({
  path,
  onClose,
  onRenamed,
}: {
  path: string | null;
  onClose: () => void;
  onRenamed: () => void;
}) => {
  const shown = useLast(path);
  const moveNote = useNotesStore((s) => s.moveNote);
  const syncFile = useUnisonStore((s) => s.syncFile);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Reset when opened, with the name (not the extension) selected for typing over
  useEffect(() => {
    if (!path) return;
    const current = fileName(path);
    setName(current);
    setError(null);
    const timer = window.setTimeout(() => {
      input.current?.focus();
      input.current?.setSelectionRange(0, current.replace(/\.\w+$/, "").length);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [path]);

  const rename = async () => {
    if (!shown) return;
    const typed = name.trim();
    if (!typed || typed.includes("/") || typed.startsWith(".")) {
      setError("Enter a file name");
      return;
    }
    const file = /\.\w+$/.test(typed) ? typed : `${typed}.org`;
    if (file === fileName(shown)) return onClose();
    try {
      const entry = await Notes.renameFile({ path: shown, name: file });
      moveNote(shown, entry.path);
      syncFile(entry.path, "save");
      onRenamed();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <Modal title="Rename note" show={!!path} onClose={onClose} onSave={rename} saveLabel="Rename">
      <Column>
        <Label>File name</Label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            rename();
          }}
        >
          <Input
            ref={input}
            className="w-full"
            value={name}
            enterKeyHint="done"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          />
        </form>
        {error && <div className="text-dusty-rose text-sm mt-1">{error}</div>}
        <div className="text-amethyst-smoke text-xs mt-2">Links to it from other notes keep the old name.</div>
      </Column>
    </Modal>
  );
};

const DeleteNoteModal = ({
  path,
  onClose,
  onDeleted,
}: {
  path: string | null;
  onClose: () => void;
  onDeleted: () => void;
}) => {
  const shown = useLast(path);
  const forgetNote = useNotesStore((s) => s.forgetNote);
  const syncFile = useUnisonStore((s) => s.syncFile);
  const synced = useUnisonStore((s) => !!shown && !!profileForPath(s.profiles, shown));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (path) setError(null);
  }, [path]);

  const remove = async () => {
    if (!shown) return;
    try {
      await Notes.deleteFile({ path: shown });
      forgetNote(shown);
      syncFile(shown, "save");
      onDeleted();
    } catch (e) {
      setError(String(e));
    }
  };

  const name = shown ? fileName(shown) : "";
  return (
    <Modal
      title="Delete note?"
      description={
        synced
          ? `${name} will be deleted from this phone, and from the server when it next syncs.`
          : `${name} will be deleted from this phone.`
      }
      show={!!path}
      onClose={onClose}
      footer={
        <Button className={`${DANGER} mr-auto`} onClick={remove}>
          Delete
        </Button>
      }
    >
      {error && <div className="text-dusty-rose text-sm text-center">{error}</div>}
    </Modal>
  );
};
