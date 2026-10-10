import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, PRIMARY, SECONDARY } from "../fragments/Button";
import { SubHeader, TextArea, Wrapper } from "../fragments/Elements";
import { Modal } from "../fragments/Modal";
import { Page } from "../fragments/Page";
import { Chunk, Pick, conflictCount, merge, mergedText } from "../merge/merge";
import { ConflictChoice, ConflictDetails, ConflictSide, Unison } from "../plugins/unison";
import { fileName } from "../stores/notesStore";
import { prettyDateTime } from "../utils/date";

export const conflictPath = (profile: string, path: string) =>
  `/conflict?profile=${encodeURIComponent(profile)}&path=${encodeURIComponent(path)}`;

/** Lines of unchanged text shown around changes; the rest is folded */
const CONTEXT = 2;

/** Colors telling the sides apart, from the artwork's lamp light and clouds */
const SIDE_BORDER = { android: "border-apricot", server: "border-lilac", both: "border-desert-sand" };
const SIDE_TEXT = { android: "text-apricot", server: "text-lilac", both: "text-desert-sand" };

export const ConflictRoute = () => {
  const [params] = useSearchParams();
  const profile = params.get("profile") ?? "";
  const path = params.get("path") ?? "";
  return <ConflictPage key={`${profile}/${path}`} profile={profile} path={path} />;
};

/**
 * Resolves a conflict like unison's interactive mode: keep one side, keep
 * both, or merge them. Merging starts from the last version both sides
 * agreed on, so only overlapping changes need a pick.
 */
const ConflictPage = ({ profile, path }: { profile: string; path: string }) => {
  const navigate = useNavigate();
  const [details, setDetails] = useState<ConflictDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"android" | "server" | null>(null);

  useEffect(() => {
    Unison.conflictDetails({ name: profile, path })
      .then(setDetails)
      .catch((e) => setError(String(e)));
  }, [profile, path]);

  const server = details?.serverHost ?? "the server";
  const chunks = useMemo(() => {
    if (!details) return null;
    const { android: p, server: s, base } = details;
    if (p.text === null || s.text === null) return null;
    return merge(p.text, s.text, base?.text ?? null);
  }, [details]);
  const merged = chunks ? mergedText(chunks, picks) : null;

  const resolve = async (keep: ConflictChoice, text?: string) => {
    setBusy(true);
    setConfirm(null);
    setError(null);
    try {
      const { resolved, result } = await Unison.resolveConflict({ name: profile, path, keep, text });
      if (resolved) navigate(-1);
      else setError(`Unison still skips ${path}: ${result.conflictReasons?.[path] ?? result.error ?? "see the sync log"}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!details) {
    return (
      <Page title={fileName(path)}>
        <div className="text-center text-amethyst-smoke p-4">
          {error ?? `Fetching the version on ${server}…`}
        </div>
      </Page>
    );
  }

  const { android, server: remote, base } = details;
  const bothExist = android.exists && remote.exists;
  const conflicts = chunks ? conflictCount(chunks) : 0;
  const autoMerged = chunks?.filter((c) => c.kind === "change").length ?? 0;

  return (
    <Page title={fileName(path)}>
      <Section>
        <SubHeader>{capitalize(details.reason || "Changed on both sides")}</SubHeader>
        <div className="text-amethyst-smoke text-sm mb-2">
          Unison skipped {path} until you decide which version to keep.
        </div>
        <SideRow label="Android" side={android} color={SIDE_TEXT.android} />
        <SideRow label={server} side={remote} color={SIDE_TEXT.server} />
      </Section>

      {chunks && (
        <Section>
          <SubHeader>Merge</SubHeader>
          <div className="text-amethyst-smoke text-sm mb-2">
            {base
              ? `${plural(autoMerged, "change")} merged automatically, ${plural(conflicts, "conflicting change")} to pick.`
              : "There's no record of the last version both sides agreed on (Nouture keeps one from now on), so every difference needs a pick."}
          </div>

          {editing === null ? (
            <MergeView chunks={chunks} picks={picks} server={server} onPick={(i, pick) => setPicks({ ...picks, [i]: pick })} />
          ) : (
            <TextArea
              className="w-full min-h-[50vh]"
              value={editing}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditing(e.target.value)}
            />
          )}

          <div className="flex flex-wrap gap-1 mt-3">
            <Button
              className={`flex-1 ${PRIMARY} disabled:opacity-50`}
              disabled={busy || (editing === null && merged === null)}
              onClick={() => resolve("merged", editing ?? merged!)}
            >
              Save merge
            </Button>
            <Button
              className={`${SECONDARY} disabled:opacity-50`}
              disabled={busy || (editing === null && merged === null)}
              onClick={() => setEditing(editing === null ? merged : null)}
            >
              {editing === null ? "Edit first" : "Back to picks"}
            </Button>
          </div>
          {editing === null && merged === null && (
            <div className="text-xs text-amethyst-smoke mt-1">Pick a version for each conflicting change to save.</div>
          )}
        </Section>
      )}

      <Section>
        <SubHeader>Or keep one version</SubHeader>
        <div className="flex flex-col gap-1">
          <Button className={`${SECONDARY} disabled:opacity-50`} disabled={busy} onClick={() => setConfirm("android")}>
            Keep Android's{android.exists ? "" : " (deleted)"}
          </Button>
          <Button className={`${SECONDARY} disabled:opacity-50`} disabled={busy} onClick={() => setConfirm("server")}>
            Keep {server}'s{remote.exists ? "" : " (deleted)"}
          </Button>
          {bothExist && (
            <>
              <Button className={`${SECONDARY} disabled:opacity-50`} disabled={busy} onClick={() => resolve("both")}>
                Keep both
              </Button>
              <div className="text-xs text-amethyst-smoke">
                Keep both uses {server}'s version and saves Android's next to it as{" "}
                {copyName(path)}.
              </div>
            </>
          )}
        </div>
        {busy && <div className="text-sm text-apricot mt-2">Syncing…</div>}
        {error && <div className="text-sm text-dusty-rose mt-2 wrap-break-word">{error}</div>}
      </Section>

      <Modal
        title={confirm === "android" ? "Keep Android's version?" : `Keep ${server}'s version?`}
        description={
          confirm === "android"
            ? `${server}'s changes to ${fileName(path)} will be lost on all your devices.`
            : `Android's changes to ${fileName(path)} will be lost.`
        }
        show={confirm !== null}
        onClose={() => setConfirm(null)}
        onSave={() => confirm && resolve(confirm)}
        saveLabel="Keep"
      />
    </Page>
  );
};

const Section = ({ children }: { children: React.ReactNode }) => (
  <Wrapper className="rounded-lg mb-6 shadow-lg">{children}</Wrapper>
);

const SideRow = ({ label, side, color }: { label: string; side: ConflictSide; color: string }) => (
  <div className="flex justify-between gap-2 text-sm">
    <span className={`font-bold ${color}`}>{label}</span>
    <span className="text-amethyst-smoke text-right">
      {!side.exists
        ? "deleted"
        : [
            formatSize(side.size),
            side.binary ? "binary" : null,
            side.mtime ? `modified ${prettyDateTime(new Date(side.mtime))}` : null,
          ]
            .filter(Boolean)
            .join(", ")}
    </span>
  </div>
);

/** The merged file: unchanged text folded, changes marked by side, conflicts to pick */
const MergeView = ({
  chunks,
  picks,
  server,
  onPick,
}: {
  chunks: Chunk[];
  picks: Record<number, Pick>;
  server: string;
  onPick: (index: number, pick: Pick) => void;
}) => (
  <div className="flex flex-col gap-1">
    {chunks.map((chunk, i) => {
      if (chunk.kind === "same") {
        return <Unchanged key={i} lines={chunk.lines} first={i === 0} last={i === chunks.length - 1} />;
      }
      if (chunk.kind === "change") {
        const label = chunk.from === "android" ? "from Android" : chunk.from === "server" ? `from ${server}` : "changed the same way on both";
        return (
          <div key={i} className={`border-l-2 pl-2 ${SIDE_BORDER[chunk.from]}`}>
            <div className={`text-xs ${SIDE_TEXT[chunk.from]}`}>{label}</div>
            <Lines lines={chunk.removed} className="line-through text-lavender-grey" />
            <Lines lines={chunk.lines} />
          </div>
        );
      }
      const options: { pick: Pick; label: string; lines: string[] }[] = [
        { pick: "android", label: "Android", lines: chunk.android },
        { pick: "server", label: server, lines: chunk.server },
      ];
      if (chunk.android.length && chunk.server.length) {
        options.push({ pick: "both", label: "Both", lines: [...chunk.android, ...chunk.server] });
      }
      return (
        <div key={i} className="rounded-lg bg-shadow-grey p-2 flex flex-col gap-1">
          <div className="text-xs text-dusty-rose">Changed differently on both sides: pick one</div>
          {chunk.base && chunk.base.length > 0 && (
            <div className="border-l-2 border-lavender-grey pl-2">
              <div className="text-xs text-lavender-grey">was</div>
              <Lines lines={chunk.base} className="text-lavender-grey" />
            </div>
          )}
          {options.map(({ pick, label, lines }) => (
            <button
              key={pick}
              className={`text-left rounded-lg p-2 border-l-2 cursor-pointer ${SIDE_BORDER[pick]} ${
                picks[i] === pick ? "bg-dusty-grape" : "bg-graphite active:bg-dusty-grape/40"
              }`}
              onClick={() => onPick(i, pick)}
            >
              <div className={`text-xs font-bold ${SIDE_TEXT[pick]}`}>
                {picks[i] === pick ? "✓ " : ""}
                {label}
              </div>
              {lines.length ? <Lines lines={lines} /> : <div className="text-xs italic text-lavender-grey">(removed)</div>}
            </button>
          ))}
        </div>
      );
    })}
  </div>
);

/** Unchanged lines, folded down to a little context around the changes */
const Unchanged = ({ lines, first, last }: { lines: string[]; first: boolean; last: boolean }) => {
  const [open, setOpen] = useState(false);
  const head = first ? 0 : CONTEXT;
  const tail = last ? 0 : CONTEXT;
  if (open || lines.length <= head + tail + 1) return <Lines lines={lines} className="text-lavender-grey" />;
  return (
    <div>
      <Lines lines={lines.slice(0, head)} className="text-lavender-grey" />
      <button className="text-xs text-amethyst-smoke cursor-pointer py-0.5" onClick={() => setOpen(true)}>
        ⋯ {plural(lines.length - head - tail, "unchanged line")}
      </button>
      <Lines lines={lines.slice(lines.length - tail)} className="text-lavender-grey" />
    </div>
  );
};

const Lines = ({ lines, className = "" }: { lines: string[]; className?: string }) =>
  lines.length ? (
    <pre className={`font-mono text-xs whitespace-pre-wrap break-all ${className}`}>
      {lines.map((l) => l.replace(/\r?\n$/, "")).join("\n")}
    </pre>
  ) : null;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

/** Matches the copy name the native side picks (without the rare collision number) */
const copyName = (path: string) => {
  const name = fileName(path);
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `“${stem} (android ${date})${ext}”`;
};
