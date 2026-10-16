import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavigationType, useBlocker, useNavigate, useSearchParams } from "react-router-dom";
import { Button, DANGER, PRIMARY, SECONDARY } from "../fragments/Button";
import { Box, TextArea } from "../fragments/Elements";
import { Modal } from "../fragments/Modal";
import { IconButton, Page } from "../fragments/Page";
import { Snackbar, SnackbarMessage } from "../fragments/Snackbar";
import { Icon } from "../icons/icon";
import { SyncSignal } from "../icons/SyncSignal";
import {
  Edit,
  LineMap,
  addEntry,
  appendEntry,
  deleteEntry,
  entryAt,
  moveSubtree,
  moveSubtreeTo,
  sameLines,
  setPriority,
  setTags,
  setTitle,
  setTodo,
  shiftSubtree,
  subtreeEnd,
  toggleCheckbox,
} from "../org/edit";
import { Folds, initialFolds, remapFolds, unfold } from "../org/folds";
import { Headline, knownTags, parse, priorities, serialize } from "../org/parse";
import { Notes } from "../plugins/notes";
import { fileName, useNotesStore } from "../stores/notesStore";
import { profileForPath, useUnisonStore } from "../stores/unisonStore";
import { conflictPath } from "./ConflictPage";
import {
  DeleteEntryModal,
  EntryAction,
  EntrySheet,
  PriorityPicker,
  StatePicker,
  TagPicker,
} from "./EntryModals";
import { OrgView } from "./OrgView";
import { notePath } from "./RecentNotes";

const AUTOSAVE_MS = 1500;
const ORG_FILE = /\.org(_archive)?$/;
const MAX_UNDO = 50;
/** Zoomed out to the whole file, in the zoom history */
const WHOLE_FILE = -1;

interface Buffer {
  text: string;
  /** Of the file's contents when read or saved, to notice changes on disk */
  hash: string;
  /** Quick edits not written to disk yet */
  dirty: boolean;
}

/** How the view was before a quick edit, to undo it */
interface Snapshot {
  text: string;
  folds: Folds | null;
  zoom: number[];
  moving: number | null;
}

/** Editing one entry as text: the rest of the file stays as it was */
interface Section {
  start: number;
  end: number;
  prefix: string;
  suffix: string;
  title: string;
  eol: string;
}

const remapZoom = (zoom: number[], map: LineMap) =>
  zoom.flatMap((line) => {
    if (line === WHOLE_FILE) return [line];
    const moved = map(line);
    return moved === null ? [] : [moved];
  });

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
  const [folds, setFolds] = useState<Folds | null>(null);

  const [sheetFor, setSheetFor] = useState<Headline | null>(null);
  const [todoFor, setTodoFor] = useState<Headline | null>(null);
  const [priorityFor, setPriorityFor] = useState<Headline | null>(null);
  const [tagsFor, setTagsFor] = useState<Headline | null>(null);
  const [deleteFor, setDeleteFor] = useState<Headline | null>(null);
  const [renaming, setRenaming] = useState<{ line: number; fresh: boolean } | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  /** The undo history's length when move mode started, to cancel it */
  const [moveStart, setMoveStart] = useState<number | null>(null);
  /** Headlines zoomed into, the current one last */
  const [zoom, setZoom] = useState<number[]>([]);
  const [section, setSection] = useState<Section | null>(null);
  const [sectionText, setSectionText] = useState("");
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [snack, setSnack] = useState<SnackbarMessage | null>(null);

  const bufferRef = useRef(buffer);
  bufferRef.current = buffer;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const view = useRef({ folds, zoom, moving, renaming });
  view.current = { folds, zoom, moving, renaming };
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
  const zoomLine = zoom.at(-1) ?? WHOLE_FILE;
  const zoomRoot = doc && zoomLine !== WHOLE_FILE ? entryAt(doc, zoomLine)?.headline ?? null : null;
  const movingEntry = doc && moving !== null ? entryAt(doc, moving) : null;

  const load = useCallback(async () => {
    try {
      const file = await Notes.readFile({ path });
      // Snapshots of other text would undo more than the quick edit
      if (file.text !== bufferRef.current?.text) setHistory([]);
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
  const write = (text: string) => {
    if (bufferRef.current) bufferRef.current = { ...bufferRef.current, text, dirty: true };
    setBuffer((b) => b && { ...b, text, dirty: true });
    if (autosave.current) clearTimeout(autosave.current.timer);
    autosave.current = { text, timer: window.setTimeout(flushAutosave, AUTOSAVE_MS) };
  };

  /**
   * A quick edit, undoable unless it's merged into the one before. Folds,
   * zoom and the moving entry follow their lines.
   */
  const applyEdit = (text: string, map: LineMap = sameLines, merge = false) => {
    const current = bufferRef.current;
    if (!current || text === current.text) return false;
    if (!merge) {
      const { folds, zoom, moving } = view.current;
      setHistory((h) => [...h, { text: current.text, folds, zoom, moving }].slice(-MAX_UNDO));
      // The oldest snapshot fell off
      if (history.length >= MAX_UNDO) setMoveStart((s) => (s === null ? s : Math.max(0, s - 1)));
    }
    setFolds((f) => f && remapFolds(f, map));
    setZoom((z) => remapZoom(z, map));
    setMoving((m) => (m === null ? null : map(m)));
    write(text);
    return true;
  };

  /** Back to how things were before history[index], dropping it and what came after */
  const restore = (index: number) => {
    const snapshot = history[index];
    if (!snapshot) return;
    setHistory((h) => h.slice(0, index));
    setMoveStart((s) => (s === null ? s : Math.min(s, index)));
    setFolds(snapshot.folds);
    setZoom(snapshot.zoom);
    setMoving(snapshot.moving);
    setRenaming(null);
    setSnack(null);
    write(snapshot.text);
  };

  const undo = () => restore(history.length - 1);

  /** Leaves move mode with everything done in it undone */
  const cancelMove = () => {
    if (moveStart !== null) restore(moveStart);
    setMoving(null);
  };

  const notify = (text: string) => setSnack({ text, id: Date.now() });

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

  // The entry being moved or zoomed into went away (a reload, an edit as text)
  useEffect(() => {
    if (!doc) return;
    if (moving !== null && !entryAt(doc, moving)) setMoving(null);
    if (zoom.some((line) => line !== WHOLE_FILE && !entryAt(doc, line))) {
      setZoom((z) => z.filter((line) => line === WHOLE_FILE || entryAt(doc, line)));
    }
  }, [doc, moving, zoom]);

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

  const closeSection = () => {
    setSection(null);
    setSectionText("");
  };

  const saveEdit = async () => {
    if (draft === undefined) {
      setEditing(false);
      closeSection();
      return true;
    }
    const before = bufferRef.current?.text ?? "";
    if (!(await save(draft))) return false;
    if (section) {
      // Lines below the entry moved; inside it, only the headline is known
      const delta = parse(draft).lines.length - parse(before).lines.length;
      const { start, end } = section;
      const map: LineMap = (l) => (l < start || l === start ? l : l >= end ? l + delta : null);
      setFolds((f) => f && remapFolds(f, map));
      setZoom((z) => remapZoom(z, map));
    }
    // Raw edits aren't undoable: undoing a quick edit before one would revert it too
    setHistory([]);
    setDraft(path, null);
    setEditing(false);
    closeSection();
    return true;
  };

  const discardEdits = () => {
    setDraft(path, null);
    setEditing(false);
    closeSection();
    load();
  };

  const openFile = (target: string) => {
    const dir = path.slice(0, path.lastIndexOf("/"));
    const file = target.startsWith("/")
      ? target
      : `${dir}/${target.replace(/^~\/.*\//, "").replace(/^\.\//, "")}`;
    navigate(notePath(file));
  };

  /** A new entry opens in rename; leaving its title empty takes it back out */
  const add = (result: Edit & { line: number }) => {
    if (result.line < 0 || !applyEdit(result.text, result.map)) return;
    const updated = parse(result.text);
    setFolds((f) => f && unfold(f, updated, result.line));
    setRenaming({ line: result.line, fresh: true });
  };

  const addAtEnd = () => {
    const current = bufferRef.current;
    if (!current) return;
    add(zoomRoot ? addEntry(current.text, zoomRoot.line, true) : appendEntry(current.text));
  };

  const finishRename = (h: Headline, title: string | null) => {
    const current = view.current.renaming;
    if (!current || current.line !== h.line) return;
    setRenaming(null);
    const clean = title?.replace(/\s+/g, " ").trim() ?? "";
    if (current.fresh && !clean) return undo();
    if (!clean || !bufferRef.current) return;
    applyEdit(setTitle(bufferRef.current.text, h.line, clean), sameLines, current.fresh);
  };

  const shift = (h: Headline, delta: 1 | -1) => {
    const current = bufferRef.current;
    if (!current) return;
    const text = shiftSubtree(current.text, h.line, delta);
    if (!applyEdit(text)) return;
    // Stays in sight under a folded new parent; promoted, it shows what it took in
    setFolds((f) => f && unfold(f, parse(text), h.line, delta < 0));
    notify(delta < 0 ? "Promoted" : "Demoted");
  };

  const moveBy = (direction: "up" | "down") => {
    const current = bufferRef.current;
    if (!current || moving === null) return;
    const { text, map } = moveSubtree(current.text, moving, direction);
    applyEdit(text, map);
  };

  const drop = (before: number, level: number) => {
    const current = bufferRef.current;
    if (!current || moving === null) return;
    const { text, map } = moveSubtreeTo(current.text, moving, before, level);
    if (!applyEdit(text, map)) return;
    const line = map(moving);
    if (line !== null) setFolds((f) => f && unfold(f, parse(text), line));
    notify("Moved");
  };

  const editSection = (h: Headline) => {
    if (!doc) return;
    flushAutosave();
    const end = subtreeEnd(doc, h);
    const part = (from: number, to: number) =>
      serialize({ lines: doc.lines.slice(from, to), eols: doc.eols.slice(from, to) });
    setSection({
      start: h.line,
      end,
      prefix: part(0, h.line),
      suffix: part(end, doc.lines.length),
      title: h.title,
      eol: doc.eols.find((e) => e !== "") ?? "\n",
    });
    setSectionText(part(h.line, end));
    setMoving(null);
    setEditing(true);
  };

  const onSheetAction = (action: EntryAction, h: Headline) => {
    setSheetFor(null);
    const current = bufferRef.current;
    if (!current) return;
    switch (action) {
      case "rename":
        return setRenaming({ line: h.line, fresh: false });
      case "state":
        return setTodoFor(h);
      case "priority":
        return setPriorityFor(h);
      case "tags":
        return setTagsFor(h);
      case "addBelow":
        return add(addEntry(current.text, h.line, false));
      case "addChild":
        return add(addEntry(current.text, h.line, true));
      case "move":
        setMoveStart(history.length);
        return setMoving(h.line);
      case "zoom":
        setMoving(null);
        return setZoom((z) => [...z, h.line]);
      case "text":
        return editSection(h);
      case "delete":
        return setDeleteFor(h);
    }
  };

  const lastFailed = !!profile?.lastResult && profile.lastResult.exitCode !== 0;
  // The editor's text differs from the file
  const unsaved = editing && draft !== undefined && !!buffer && draft !== buffer.text;
  const unsavedRef = useRef(unsaved);
  unsavedRef.current = unsaved;

  /**
   * Back (the arrow, Android's back button) first steps out of what's open
   * over the note, the innermost first. Returns whether there was something.
   */
  const stepBack = () => {
    const overlays: [unknown, (v: null) => void][] = [
      [sheetFor, setSheetFor],
      [todoFor, setTodoFor],
      [priorityFor, setPriorityFor],
      [tagsFor, setTagsFor],
      [deleteFor, setDeleteFor],
    ];
    const open = overlays.find(([value]) => value !== null);
    if (open) {
      open[1](null);
      return true;
    }
    if (renaming) {
      // The title field saves when it loses focus
      (document.activeElement as HTMLElement | null)?.blur();
      setRenaming(null);
      return true;
    }
    if (moving !== null) {
      setMoving(null);
      return true;
    }
    if (section) {
      discardEdits();
      return true;
    }
    if (zoom.length > 0) {
      setZoom((z) => z.slice(0, -1));
      return true;
    }
    return false;
  };
  const canStepBack =
    !!(sheetFor || todoFor || priorityFor || tagsFor || deleteFor || renaming || section) ||
    moving !== null ||
    zoom.length > 0;
  const canStepBackRef = useRef(canStepBack);
  canStepBackRef.current = canStepBack;

  // Leaving with unsaved changes or closing the editor with them asks first;
  // following a link isn't going back
  const blocker = useBlocker(
    ({ historyAction }) =>
      unsavedRef.current || (historyAction === NavigationType.Pop && canStepBackRef.current)
  );
  const [confirmClose, setConfirmClose] = useState(false);
  const askingToLeave = (blocker.state === "blocked" && unsaved) || confirmClose;

  useEffect(() => {
    if (blocker.state === "blocked" && !unsavedRef.current) {
      if (!stepBack()) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker.state]);

  const closeEditor = () => (unsaved ? setConfirmClose(true) : discardEdits());

  const stay = () => {
    setConfirmClose(false);
    blocker.reset?.();
  };

  // Editing one entry, back returns to the note instead of leaving it
  const leaveDiscarding = () => {
    setConfirmClose(false);
    if (blocker.state === "blocked" && !section) {
      setDraft(path, null);
      blocker.proceed();
    } else {
      discardEdits();
      blocker.reset?.();
    }
  };

  const leaveSaving = async () => {
    const wasSection = !!section;
    const saved = await saveEdit();
    setConfirmClose(false);
    if (blocker.state !== "blocked") return;
    if (saved && !wasSection) blocker.proceed();
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
          {lastFailed && !profile.running ? (
            <Icon title="exclamation_triangle_fill" />
          ) : (
            <SyncSignal syncing={profile.running} />
          )}
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
        <>
          {history.length > 0 && (
            <IconButton onClick={undo} title="Undo">
              <Icon title="arrow_counterclockwise" />
            </IconButton>
          )}
          <IconButton onClick={() => setEditing(true)} title="Edit" disabled={!buffer}>
            <Icon title="pencil" />
          </IconButton>
        </>
      )}
    </>
  );

  const titleLine = doc?.body.find((b) => b.kind === "keyword" && b.key.toLowerCase() === "title");
  const fileTitle = titleLine?.kind === "keyword" && titleLine.value ? titleLine.value : fileName(path);

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
          {section && (
            <div className="text-xs text-lavender-grey px-1 pb-1 truncate">
              Only “{section.title || "untitled"}” and what's under it
            </div>
          )}
          <TextArea
            className="w-full flex-1 resize-none"
            value={section ? sectionText : draft ?? buffer.text}
            spellCheck={false}
            autoCapitalize="off"
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              const value = e.target.value;
              if (!section) return setDraft(path, value);
              setSectionText(value);
              // The headline after it stays on its own line
              const ended =
                value === "" || section.suffix === "" || /[\r\n]$/.test(value) ? value : value + section.eol;
              setDraft(path, section.prefix + ended + section.suffix);
            }}
          />
        </div>
      ) : doc && folds ? (
        <OrgView
          doc={doc}
          folds={folds}
          onFolds={setFolds}
          onTodo={setTodoFor}
          onEntryHold={setSheetFor}
          onShift={shift}
          renaming={renaming?.line ?? null}
          onRename={finishRename}
          moving={moving}
          onDrop={drop}
          zoom={zoomRoot}
          onZoom={(line) => {
            setMoving(null);
            setZoom((z) => [...z, line ?? WHOLE_FILE]);
          }}
          fileTitle={fileTitle}
          onAddEntry={addAtEnd}
          onCheckbox={(line) => applyEdit(toggleCheckbox(buffer.text, line))}
          onOpenFile={openFile}
        />
      ) : (
        <pre className="px-4 whitespace-pre-wrap wrap-break-word font-mono text-sm">{buffer.text}</pre>
      )}

      {movingEntry && !editing && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-5 flex gap-1 bg-graphite border-2 border-dusty-grape rounded-2xl p-1 shadow-lg">
          <IconButton onClick={cancelMove} title="Cancel moving">
            <Icon title="x_lg" width={20} height={20} />
          </IconButton>
          <IconButton className="disabled:opacity-30" onClick={() => moveBy("up")} disabled={!movingEntry.prev} title="Move up">
            <Icon title="arrow_up" width={20} height={20} />
          </IconButton>
          <IconButton className="disabled:opacity-30" onClick={() => moveBy("down")} disabled={!movingEntry.next} title="Move down">
            <Icon title="arrow_down" width={20} height={20} />
          </IconButton>
          <IconButton onClick={() => setMoving(null)} title="Done moving">
            <Icon title="check_lg" width={20} height={20} />
          </IconButton>
        </div>
      )}

      <Snackbar
        message={editing ? null : snack}
        raised={!!movingEntry}
        action="Undo"
        onAction={undo}
        onClose={() => setSnack(null)}
      />

      <EntrySheet
        headline={sheetFor}
        sequences={doc?.sequences ?? []}
        hidden={sheetFor && sheetFor.line === zoomRoot?.line ? ["addBelow", "move", "zoom"] : []}
        onAction={onSheetAction}
        onClose={() => setSheetFor(null)}
      />

      <StatePicker
        headline={todoFor}
        sequences={doc?.sequences ?? []}
        onPick={(keyword) => {
          if (buffer && todoFor) applyEdit(setTodo(buffer.text, todoFor.line, keyword));
          setTodoFor(null);
        }}
        onClose={() => setTodoFor(null)}
      />

      <PriorityPicker
        headline={priorityFor}
        priorities={doc ? priorities(doc) : []}
        onPick={(priority) => {
          if (buffer && priorityFor) applyEdit(setPriority(buffer.text, priorityFor.line, priority));
          setPriorityFor(null);
        }}
        onClose={() => setPriorityFor(null)}
      />

      <TagPicker
        headline={tagsFor}
        known={doc ? knownTags(doc) : []}
        onSave={(tags) => {
          if (buffer && tagsFor) applyEdit(setTags(buffer.text, tagsFor.line, tags));
          setTagsFor(null);
        }}
        onClose={() => setTagsFor(null)}
      />

      <DeleteEntryModal
        headline={deleteFor}
        text={buffer?.text ?? ""}
        file={fileName(path)}
        onDelete={(headline) => {
          if (buffer) {
            const { text, map } = deleteEntry(buffer.text, headline.line);
            if (applyEdit(text, map)) notify(`Deleted “${headline.title || "entry"}”`);
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
            closeSection();
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
