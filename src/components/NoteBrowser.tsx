import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../fragments/Button";
import { Column, Input, Label, SubHeader, Wrapper } from "../fragments/Elements";
import { Modal } from "../fragments/Modal";
import { Page } from "../fragments/Page";
import { NoteEntry, Notes } from "../plugins/notes";
import { Profile } from "../plugins/unison";
import { useUnisonStore } from "../stores/unisonStore";
import { prettyDateTime } from "../utils/date";
import { AccessBanner } from "./AccessBanner";
import { NoteRow, notePath } from "./RecentNotes";

export const NoteBrowser = () => {
  const profiles = useUnisonStore((s) => s.profiles);
  const refresh = useUnisonStore((s) => s.refresh);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Page title="Notes">
      <AccessBanner />
      {profiles
        .filter((p) => p.localRoot)
        .map((profile) => (
          <ProfileFiles key={profile.name} profile={profile} />
        ))}
      {profiles.length === 0 && (
        <div className="text-center text-amethyst-smoke p-4">
          Add a sync profile first; its local root is listed here.
        </div>
      )}
    </Page>
  );
};

const ProfileFiles = ({ profile }: { profile: Profile }) => {
  const navigate = useNavigate();
  const root = profile.localRoot!;
  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    () => Notes.listDir({ path: root }).then((r) => setEntries(r.entries)),
    [root]
  );

  // Reload whenever a sync of this profile finishes
  useEffect(() => {
    load();
  }, [load, profile.lastResult?.finishedAt]);

  const toggle = (dir: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (!next.delete(dir)) next.add(dir);
      return next;
    });

  const renderDir = (dir: string, depth: number) =>
    entries
      .filter((e) => e.path.slice(0, e.path.lastIndexOf("/")) === dir)
      .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name))
      .map((entry) => (
        <div key={entry.path} style={{ paddingLeft: `${depth}rem` }}>
          {entry.isDirectory ? (
            <>
              <NoteRow
                name={entry.name}
                icon={open.has(entry.path) ? "folder2_open" : "folder"}
                onClick={() => toggle(entry.path)}
              />
              {open.has(entry.path) && renderDir(entry.path, depth + 1)}
            </>
          ) : (
            <NoteRow
              name={entry.name}
              detail={prettyDateTime(new Date(entry.mtime), "short")}
              onClick={() => navigate(notePath(entry.path))}
            />
          )}
        </div>
      ));

  return (
    <Wrapper className="rounded-lg mb-6 shadow-lg">
      <SubHeader>{profile.name}</SubHeader>
      <div className="text-amethyst-smoke text-sm break-all mb-2">{root}</div>
      {renderDir(root, 0)}
      {entries.length === 0 && (
        <div className="text-center text-amethyst-smoke p-4 text-sm">
          Nothing here yet. Run a sync to fetch your notes.
        </div>
      )}
      <Button
        className="bg-amethyst-smoke hover:bg-amethyst-smoke/90 active:bg-lavender-grey/80 w-full mt-2"
        onClick={() => setCreating(true)}
      >
        New note
      </Button>
      <NewNoteModal
        root={root}
        show={creating}
        onClose={() => setCreating(false)}
        onCreated={(path) => navigate(notePath(path))}
      />
    </Wrapper>
  );
};

const NewNoteModal = ({
  root,
  show,
  onClose,
  onCreated,
}: {
  root: string;
  show: boolean;
  onClose: () => void;
  onCreated: (path: string) => void;
}) => {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset when opened; the modal stays mounted so its popup animation runs
  useEffect(() => {
    if (!show) return;
    setName("");
    setError(null);
  }, [show]);

  const create = async () => {
    const title = name.trim();
    if (!title || title.includes("/")) {
      setError("Enter a file name");
      return;
    }
    const file = /\.\w+$/.test(title) ? title : `${title}.org`;
    try {
      const entry = await Notes.createFile({
        path: `${root}/${file}`,
        text: `#+title: ${title.replace(/\.org$/, "")}\n\n`,
      });
      onClose();
      onCreated(entry.path);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <Modal title="New note" show={show} onClose={onClose} onSave={create} saveLabel="Create">
      <Column>
        <Label>File name</Label>
        <Input
          value={name}
          placeholder="ideas"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
        />
        {error && <div className="text-dusty-rose text-sm mt-1">{error}</div>}
      </Column>
    </Modal>
  );
};
