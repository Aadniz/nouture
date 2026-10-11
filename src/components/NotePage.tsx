import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useSearchParams } from "react-router-dom";
import { Button, DANGER, PRIMARY, SECONDARY } from "../fragments/Button";
import { Box, TextArea } from "../fragments/Elements";
import { Modal } from "../fragments/Modal";
import { IconButton, Page } from "../fragments/Page";
import { Icon } from "../icons/icon";
import { deleteEntry, setTodo, toggleCheckbox } from "../org/edit";
import { Folds, initialFolds, removeLines } from "../org/folds";
import { Headline, parse } from "../org/parse";
import { Notes } from "../plugins/notes";
import { fileName, useNotesStore } from "../stores/notesStore";
import { profileForPath, useUnisonStore } from "../stores/unisonStore";
import { conflictPath } from "./ConflictPage";
import { DeleteEntryModal, StatePicker } from "./EntryModals";
import { OrgView } from "./OrgView";
import { notePath } from "./RecentNotes";

const AUTOSAVE_MS = 1500;
const ORG_FILE = /\.org(_archive)?$/;

interface Buffer {
  text: string;
  /** Of the file's contents when read or saved, to notice changes on disk */
  hash: string;
  /** Quick edits not written to disk yet */
  dirty: boolean;
}

/** One page per file, so pending saves can never end up in another note. */
export const NoteRoute = () => {
  const [params] = useSearchParams();
  const path = params.get("path") ?? "";
  return <NotePage key={path} path={path} />;
};

const NotePage = ({ path }: { path: string }) => {
  const navigate = useNavigate();
  const profile = useUnisonStore((s) => profileForPath(s.profiles, path));
  const syncFile = useUnisonStore((s) => s.syncFile);
  const sync = useUnisonStore((s) => s.sync);
  const setDraft = useNotesStore((s) => s.setDraft);
  const draft = useNotesStore((s) => s.drafts[path]);

  const [buffer, setBuffer] = useState<Buffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Unsaved editor text from last time reopens the editor
  const [editing, setEditing] = useState(draft !== undefined);
  const [changedOnDisk, setChangedOnDisk] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [todoFor, setTodoFor] = useState<Headline | null>(null);
  const [deleteFor, setDeleteFor] = useState<Headline | null>(null);
  const [folds, setFolds] = useState<Folds | null>(null);

  const bufferRef = useRef(buffer);
  bufferRef.current = buffer;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const autosave = useRef<{ timer: number; text: string } | null>(null);
  const openSynced = useRef(false);

  const isOrg = ORG_FILE.test(path);
  // Unison skipped this note: changed both here and elsewhere
  const relative = profile?.localRoot ? path.slice(profile.localRoot.length + 1) : null;
  const syncConflict =
    relative && profile?.lastResult?.conflicts.includes(relative)
      ? profile.lastResult.conflictReasons?.[relative] ?? "changed on both sides"
      : null;
  const doc = useMemo(() => (buffer && isOrg ? parse(buffer.text) : null), [buffer?.text, isOrg]);

  const load = useCallback(async () => {
    try {
      const file = await Notes.readFile({ path });
      setBuffer({ text: file.text, hash: file.hash, dirty: false });
      setChangedOnDisk(false);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [path]);

  const save = useCallback(
    async (text: string, force = false) => {
      const current = bufferRef.current;
      if (!current) return false;
      try {
        const result = await Notes.writeFile({
          path,
          text,
          expectedHash: force ? undefined : current.hash,
        });
        if (result.conflict) {
          setConflict(text);
          return false;
        }
        setBuffer({ text, hash: result.hash, dirty: false });
        setChangedOnDisk(false);
        syncFile(path, "save"); // after-save-hook
        return true;
      } catch (e) {
        setError(String(e));
        return false;
      }
    },
    [path, syncFile]
  );

  const flushAutosave = useCallback(() => {
    const pending = autosave.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    autosave.current = null;
    save(pending.text);
  }, [save]);

  /** Quick edits from the viewer are saved shortly after the last tap. */
  const applyEdit = (text: string) => {
    setBuffer((b) => b && { ...b, text, dirty: true });
    if (autosave.current) clearTimeout(autosave.current.timer);
    autosave.current = { text, timer: window.setTimeout(flushAutosave, AUTOSAVE_MS) };
  };

  useEffect(() => {
    load();
  }, [load]);

  // Leaving the page saves pending quick edits
  useEffect(() => flushAutosave, [flushAutosave]);

  // Opening a file syncs it in the background, like Emacs' find-file-hook
  useEffect(() => {
    if (profile && !openSynced.current) {
      openSynced.current = true;
      syncFile(path, "open");
    }
  }, [profile, syncFile, path]);

  useEffect(() => {
    if (doc && !folds) setFolds(initialFolds(doc));
  }, [doc, folds]);

  // After a sync, pick up the new version like Doom's auto-revert, unless
  // that would throw away unsaved changes
  const finishedAt = profile?.lastResult?.finishedAt;
  useEffect(() => {
    if (!finishedAt || !bufferRef.current) return;
    Notes.stat({ path }).then((stat) => {
      const current = bufferRef.current;
      if (!current || !stat.hash || stat.hash === current.hash) return;
      if (current.dirty || draftRef.current !== undefined) setChangedOnDisk(true);
      else load();
    });
  }, [finishedAt, path, load]);

  const saveEdit = async () => {
    if (draft === undefined || (await save(draft))) {
      setDraft(path, null);
      setEditing(false);
      return true;
    }
    return false;
  };

  const discardEdits = () => {
    setDraft(path, null);
    setEditing(false);
    load();
  };

  const openFile = (target: string) => {
    const dir = path.slice(0, path.lastIndexOf("/"));
    const file = target.startsWith("/")
      ? target
      : `${dir}/${target.replace(/^~\/.*\//, "").replace(/^\.\//, "")}`;
    navigate(notePath(file));
  };

  const lastFailed = !!profile?.lastResult && profile.lastResult.exitCode !== 0;
  // The editor's text differs from the file
  const unsaved = editing && draft !== undefined && !!buffer && draft !== buffer.text;
  const unsavedRef = useRef(unsaved);
  unsavedRef.current = unsaved;

  // Leaving with unsaved changes (back arrow, Android's back button) or
  // closing the editor with them asks first
  const blocker = useBlocker(() => unsavedRef.current);
  const [confirmClose, setConfirmClose] = useState(false);
  const askingToLeave = blocker.state === "blocked" || confirmClose;

  const closeEditor = () => (unsaved ? setConfirmClose(true) : discardEdits());

  const stay = () => {
    setConfirmClose(false);
    blocker.reset?.();
  };

  const leaveDiscarding = () => {
    setConfirmClose(false);
    if (blocker.state === "blocked") {
      setDraft(path, null);
      blocker.proceed();
    } else {
      discardEdits();
    }
  };

  const leaveSaving = async () => {
    const saved = await saveEdit();
    setConfirmClose(false);
    if (blocker.state !== "blocked") return;
    if (saved) blocker.proceed();
    else blocker.reset();
  };

  const actions = (
    <>
      {profile && (
        <IconButton
          onClick={() => sync(profile.name)}
          title={profile.running ? "Syncing" : "Sync now"}
          className={lastFailed && !profile.running ? "text-dusty-rose" : ""}
        >
          <span className={`inline-block ${profile.running ? "animate-spin" : ""}`}>
            <Icon title={lastFailed && !profile.running ? "exclamation_triangle_fill" : "arrow_repeat"} />
          </span>
        </IconButton>
      )}
      {editing ? (
        <>
          <IconButton onClick={closeEditor} title="Close the editor">
            <Icon title="x_lg" />
          </IconButton>
          <IconButton onClick={saveEdit} title={unsaved ? "Save (unsaved changes)" : "Save"}>
            <span className="relative inline-block">
              <Icon title="save" />
              {unsaved && <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-apricot" />}
            </span>
          </IconButton>
        </>
      ) : (
        <IconButton onClick={() => setEditing(true)} title="Edit" disabled={!buffer}>
          <Icon title="pencil" />
        </IconButton>
      )}
    </>
  );

  return (
    <Page title={fileName(path)} actions={actions} fill={editing}>
      {error && <div className="text-dusty-rose text-sm px-4 wrap-break-word">{error}</div>}

      {syncConflict && profile && (
        <Box>
          <p>This note has a sync conflict: {syncConflict}.</p>
          <div className="flex justify-center mt-2">
            <Button className={PRIMARY} onClick={() => navigate(conflictPath(profile.name, relative!))}>
              Resolve
            </Button>
          </div>
        </Box>
      )}

      {changedOnDisk && (
        <Box>
          <p>This file changed on disk while you had unsaved changes.</p>
          <div className="flex gap-1 justify-center mt-2">
            <Button className={SECONDARY} onClick={discardEdits}>
              Reload
            </Button>
            <Button className={PRIMARY} onClick={() => setChangedOnDisk(false)}>
              Keep mine
            </Button>
          </div>
        </Box>
      )}

      {!buffer ? (
        !error && <div className="text-center text-amethyst-smoke p-4">Loading...</div>
      ) : editing ? (
        <div className="px-2 flex-1 min-h-0 flex flex-col">
          <TextArea
            className="w-full flex-1 resize-none"
            value={draft ?? buffer.text}
            spellCheck={false}
            autoCapitalize="off"
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(path, e.target.value)}
          />
        </div>
      ) : doc && folds ? (
        <OrgView
          doc={doc}
          folds={folds}
          onFolds={setFolds}
          onTodo={setTodoFor}
          onEntryHold={setDeleteFor}
          onCheckbox={(line) => applyEdit(toggleCheckbox(buffer.text, line))}
          onOpenFile={openFile}
        />
      ) : (
        <pre className="px-4 whitespace-pre-wrap wrap-break-word font-mono text-sm">{buffer.text}</pre>
      )}

      <StatePicker
        headline={todoFor}
        sequences={doc?.sequences ?? []}
        onPick={(keyword) => {
          if (buffer && todoFor) applyEdit(setTodo(buffer.text, todoFor.line, keyword));
          setTodoFor(null);
        }}
        onClose={() => setTodoFor(null)}
      />

      <DeleteEntryModal
        headline={deleteFor}
        text={buffer?.text ?? ""}
        file={fileName(path)}
        onDelete={(headline) => {
          if (buffer) {
            const { text, removed } = deleteEntry(buffer.text, headline.line);
            if (removed > 0) {
              // Folding is kept per line: the lines below moved up
              setFolds((f) => f && removeLines(f, headline.line, removed));
              applyEdit(text);
            }
          }
          setDeleteFor(null);
        }}
        onClose={() => setDeleteFor(null)}
      />

      <Modal
        title="Unsaved changes"
        description={`Discard your changes to ${fileName(path)}?`}
        show={askingToLeave}
        onClose={stay}
        onSave={leaveSaving}
        footer={
          <Button className={`${DANGER} mr-auto`} onClick={leaveDiscarding}>
            Discard
          </Button>
        }
      />

      <Modal
        title="Changed on disk"
        description="The file was modified (probably by a sync) after you opened it."
        show={conflict !== null}
        onClose={() => setConflict(null)}
        onSave={async () => {
          const text = conflict!;
          setConflict(null);
          if (await save(text, true)) {
            setDraft(path, null);
            setEditing(false);
          }
        }}
        saveLabel="Overwrite"
        footer={
          <Button
            className={SECONDARY}
            onClick={() => {
              setConflict(null);
              discardEdits();
            }}
          >
            Reload
          </Button>
        }
      >
        <p className="text-center">Overwrite it with your version, or reload and lose your changes?</p>
      </Modal>
    </Page>
  );
};
