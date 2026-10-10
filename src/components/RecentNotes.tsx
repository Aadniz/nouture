import { App } from "@capacitor/app";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, PRIMARY } from "../fragments/Button";
import { Row, SubHeader, Wrapper } from "../fragments/Elements";
import { IconButton } from "../fragments/Page";
import { Icon } from "../icons/icon";
import { NotePreview, Notes } from "../plugins/notes";
import { useUnisonStore } from "../stores/unisonStore";
import { AccessBanner } from "./AccessBanner";
import { OrgSnippet } from "./OrgSnippet";

/** Two columns of four */
const MAX_PREVIEWS = 8;

export const notePath = (path: string) => `/note?path=${encodeURIComponent(path)}`;

/** The most recently edited notes, each previewing the part that changed. */
export const RecentNotes = () => {
  const navigate = useNavigate();
  const profiles = useUnisonStore((s) => s.profiles);
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
    Notes.recentNotes({ roots, limit: MAX_PREVIEWS })
      .then((result) => {
        setNotes(result.notes);
        setTotal(result.total);
      })
      .catch(() => setNotes([]));
  }, [roots.join("\n"), synced, resumed]);

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
            <PreviewCard key={note.path} note={note} onOpen={() => navigate(notePath(note.path))} />
          ))}
        </div>
      )}

      {total > MAX_PREVIEWS && (
        <Button className={`w-full mt-2 ${PRIMARY}`} onClick={() => navigate("/notes")}>
          More notes…
        </Button>
      )}
    </Wrapper>
  );
};

/** A 2:1 card; the preview is dimmed, the file name is not */
const PreviewCard = ({ note, onOpen }: { note: NotePreview; onOpen: () => void }) => (
  <button
    className="flex flex-col aspect-2/1 rounded-xl bg-graphite p-2 text-left cursor-pointer active:bg-dusty-grape/20"
    onClick={onOpen}
  >
    <div className="relative flex-1 min-h-0 w-full overflow-hidden opacity-70">
      <OrgSnippet text={note.text} edited={note.edited} maxLines={5} />
      {/* Fade the lower half out towards the file name */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-graphite to-transparent" />
    </div>
    <span className="self-end max-w-full truncate text-xs font-bold text-desert-sand">{note.name}</span>
  </button>
);

export const NoteRow = ({
  name,
  detail,
  icon = "file_earmark_text",
  onClick,
}: {
  name: string;
  detail?: string;
  icon?: "file_earmark_text" | "folder2_open" | "folder";
  onClick: () => void;
}) => (
  <button
    className="flex items-center gap-2 w-full text-left py-2 px-2 rounded-lg hover:bg-graphite active:bg-dusty-grape/20 cursor-pointer"
    onClick={onClick}
  >
    <span className="text-amethyst-smoke">
      <Icon title={icon} />
    </span>
    <span className="flex-1 truncate">{name}</span>
    {detail && <span className="text-amethyst-smoke text-sm">{detail}</span>}
  </button>
);
