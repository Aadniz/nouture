import { App } from "@capacitor/app";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, PRIMARY } from "../fragments/Button";
import { Row, SubHeader, Wrapper } from "../fragments/Elements";
import { ColorSquare, colorClasses } from "../fragments/ProfileColor";
import { IconButton } from "../fragments/Page";
import { Icon } from "../icons/icon";
import { useRowGestures } from "../hooks/useRowGestures";
import { NotePreview, Notes } from "../plugins/notes";
import { useNotesStore } from "../stores/notesStore";
import { profileForPath, useUnisonStore } from "../stores/unisonStore";
import { AccessBanner } from "./AccessBanner";
import { NoteActions } from "./NoteActions";
import { OrgSnippet } from "./OrgSnippet";

/** Two columns of four */
const MAX_PREVIEWS = 8;

export const notePath = (path: string) => `/note?path=${encodeURIComponent(path)}`;

/**
 * The pinned and the most recently edited notes, each previewing the part
 * that changed. Hidden notes stay off.
 */
export const RecentNotes = () => {
  const navigate = useNavigate();
  const profiles = useUnisonStore((s) => s.profiles);
  const hidden = useNotesStore((s) => s.hidden);
  const pinned = useNotesStore((s) => s.pinned);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [changed, setChanged] = useState(0);
  const roots = profiles.flatMap((p) => (p.localRoot ? [p.localRoot] : []));
  // Notes change when a sync finishes, or while Nouture was in the background
  const synced = profiles.map((p) => p.lastResult?.finishedAt ?? 0).join();
  const [resumed, setResumed] = useState(0);
  const [notes, setNotes] = useState<NotePreview[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const listener = App.addListener("resume", () => setResumed((n) => n + 1));
    return () => {
      listener.then((l) => l.remove());
    };
  }, []);

  useEffect(() => {
    if (!roots.length) return;
    Notes.recentNotes({ roots, limit: MAX_PREVIEWS, hidden, pinned })
      .then((result) => {
        setNotes(result.notes);
        setTotal(result.total);
      })
      .catch(() => setNotes([]));
  }, [roots.join("\n"), synced, resumed, hidden.join("\n"), pinned.join("\n"), changed]);

  return (
    <Wrapper className="rounded-lg mb-6 shadow-lg">
      <Row className="items-center justify-between">
        <SubHeader>Recent notes</SubHeader>
        <IconButton onClick={() => navigate("/notes")} title="All notes">
          <Icon title="folder2_open" />
        </IconButton>
      </Row>
      <AccessBanner />

      {notes.length === 0 ? (
        <div className="text-center text-amethyst-smoke p-4 text-sm">
          Your notes show up here once a profile has synced.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mt-1">
          {notes.map((note) => (
            <PreviewCard
              key={note.path}
              note={note}
              pinned={pinned.includes(note.path)}
              color={profileForPath(profiles, note.path)?.color}
              onOpen={() => navigate(notePath(note.path))}
              onHold={() => setActionsFor(note.path)}
            />
          ))}
        </div>
      )}

      {total > notes.length && (
        <Button className={`w-full mt-2 ${PRIMARY}`} onClick={() => navigate("/notes")}>
          More notes…
        </Button>
      )}

      <NoteActions path={actionsFor} onClose={() => setActionsFor(null)} onChanged={() => setChanged((n) => n + 1)} />
    </Wrapper>
  );
};

/** A 2:1 card; the preview is dimmed, the file name is not */
const PreviewCard = ({
  note,
  pinned,
  color,
  onOpen,
  onHold,
}: {
  note: NotePreview;
  pinned: boolean;
  /** Its profile's color */
  color?: string | null;
  onOpen: () => void;
  onHold: () => void;
}) => {
  const hold = useRowGestures({ onHold });
  return (
    <button
      className={`flex flex-col aspect-2/1 rounded-xl p-2 text-left cursor-pointer select-none [-webkit-touch-callout:none] transition-colors ${
        hold.pressing ? "bg-dusty-grape/40 duration-500" : "bg-graphite duration-150 active:bg-dusty-grape/20"
      }`}
      onClick={onOpen}
      {...hold.handlers}
    >
      <div className="relative flex-1 min-h-0 w-full overflow-hidden opacity-70">
        <OrgSnippet text={note.text} edited={note.edited} maxLines={5} />
        {/* Fade the lower half out towards the file name */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-graphite to-transparent" />
      </div>
      <span
        className={`self-end max-w-full flex items-center gap-1 text-xs font-bold ${
          colorClasses(color)?.text ?? "text-desert-sand"
        }`}
      >
        {pinned && <Icon title="pin_angle_fill" width={10} height={10} />}
        <span className="truncate">{note.name}</span>
      </span>
    </button>
  );
};

export const NoteRow = ({
  name,
  detail,
  icon = "file_earmark_text",
  hidden = false,
  pinned = false,
  color,
  onClick,
  onHold,
}: {
  name: string;
  detail?: string;
  icon?: "file_earmark_text" | "folder2_open" | "folder";
  /** Left off the front page: dimmed */
  hidden?: boolean;
  pinned?: boolean;
  /** Its profile's color */
  color?: string | null;
  onClick: () => void;
  onHold?: () => void;
}) => {
  const hold = useRowGestures({ onHold: () => onHold?.() });
  return (
    <button
      className={`flex items-center gap-2 w-full text-left py-2 px-2 rounded-lg cursor-pointer transition-colors ${
        hold.pressing ? "bg-dusty-grape/40 duration-500" : "hover:bg-graphite active:bg-dusty-grape/20 duration-150"
      } ${onHold ? "select-none [-webkit-touch-callout:none]" : ""}`}
      onClick={onClick}
      {...(onHold ? hold.handlers : {})}
    >
      <span className={`text-amethyst-smoke ${hidden ? "opacity-50" : ""}`}>
        <Icon title={icon} />
      </span>
      <span className={`flex-1 min-w-0 flex items-center gap-1.5 ${hidden ? "opacity-50" : ""}`}>
        <span className="truncate">{name}</span>
        <ColorSquare color={color} />
      </span>
      {pinned && (
        <span className="text-desert-sand" title="Pinned to the front page">
          <Icon title="pin_angle_fill" width={12} height={12} />
        </span>
      )}
      {hidden && (
        <span className="text-amethyst-smoke" title="Hidden from the front page">
          <Icon title="eye_slash" width={14} height={14} />
        </span>
      )}
      {detail && <span className="text-amethyst-smoke text-sm">{detail}</span>}
    </button>
  );
};
