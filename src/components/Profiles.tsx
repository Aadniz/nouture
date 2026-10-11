import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Chip } from "../fragments/Button";
import { CheckIcon } from "../fragments/Checkbox";
import { Box, Column, SubHeader, Wrapper } from "../fragments/Elements";
import { Modal } from "../fragments/Modal";
import { IconButton } from "../fragments/Page";
import { Icon } from "../icons/icon";
import { HostKey, Profile, SyncResult, Unison } from "../plugins/unison";
import { useUnisonStore } from "../stores/unisonStore";
import { parseRoot } from "../unison/profile";
import { prettyDateTime } from "../utils/date";
import { conflictPath } from "./ConflictPage";
import { SyncLog } from "./SyncLog";

interface TestState {
  testing?: boolean;
  ok?: boolean;
  message?: string;
}

export const Profiles = () => {
  const navigate = useNavigate();
  const { profiles, error, refresh, sync, setAutoSync } = useUnisonStore();
  const [logFor, setLogFor] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [hostKey, setHostKey] = useState<{
    profile: string;
    key: HostKey;
  } | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const test = async (name: string) => {
    setTests((t) => ({ ...t, [name]: { testing: true } }));
    try {
      await Unison.requestLocalNetwork();
      const result = await Unison.testConnection({ name });
      setTests((t) => ({
        ...t,
        [name]: { ok: result.ok, message: result.message },
      }));
      if (result.unknownHostKey)
        setHostKey({ profile: name, key: result.unknownHostKey });
    } catch (e) {
      setTests((t) => ({ ...t, [name]: { ok: false, message: String(e) } }));
    }
  };

  const trust = async () => {
    if (!hostKey) return;
    const { fingerprint: _, ...key } = hostKey.key;
    await Unison.trustHost(key);
    setHostKey(null);
    test(hostKey.profile);
  };

  return (
    <>
      <Wrapper className="rounded-lg shadow-lg">
        <SubHeader>Sync profiles</SubHeader>
        {error && <div className="text-dusty-rose text-sm p-2">{error}</div>}
        {profiles.length === 0 ? (
          <div className="text-center text-amethyst-smoke p-4">
            <p>No unison profiles yet.</p>
            <p className="text-sm mt-2">
              Add one just like ~/.unison/*.prf on your computer.
            </p>
          </div>
        ) : (
          <div className="grid">
            {profiles.map((profile) => (
              <ProfileCard
                key={profile.name}
                profile={profile}
                test={tests[profile.name]}
                onTest={() => test(profile.name)}
                onEdit={() =>
                  navigate(`/profile?name=${encodeURIComponent(profile.name)}`)
                }
                onResolve={(path) => navigate(conflictPath(profile.name, path))}
                onLog={() => setLogFor(profile.name)}
                onSync={() =>
                  Unison.requestLocalNetwork().then(() => sync(profile.name))
                }
                onAutoSync={() => setAutoSync(profile.name, !profile.autoSync)}
              />
            ))}
          </div>
        )}

        <Button
          className="bg-amethyst-smoke hover:bg-amethyst-smoke/90 active:bg-lavender-grey/80 m-2"
          onClick={() => navigate("/profile")}
        >
          Add profile
        </Button>
      </Wrapper>

      <SyncLog profile={logFor} onClose={() => setLogFor(null)} />

      <Modal
        title="Trust this server?"
        description="First connection to this host. Compare the fingerprint with ssh-keygen -lF on a computer that already trusts it."
        show={!!hostKey}
        onClose={() => setHostKey(null)}
        onSave={trust}
        saveLabel="Trust"
      >
        {hostKey && (
          <Column className="gap-1 text-center">
            <span className="text-navajo-white break-all">
              {hostKey.key.host}
            </span>
            <span className="text-amethyst-smoke text-sm">
              {hostKey.key.type}
            </span>
            <span className="font-mono text-desert-sand text-sm break-all">
              {hostKey.key.fingerprint}
            </span>
          </Column>
        )}
      </Modal>
    </>
  );
};

const ProfileCard = ({
  profile,
  test,
  onTest,
  onEdit,
  onResolve,
  onLog,
  onSync,
  onAutoSync,
}: {
  profile: Profile;
  test?: TestState;
  onTest: () => void;
  onEdit: () => void;
  onResolve: (path: string) => void;
  onLog: () => void;
  onSync: () => void;
  onAutoSync: () => void;
}) => {
  const result = profile.lastResult;

  return (
    <Box className={`text-left p-3`}>
      <div className="flex items-center gap-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate">{profile.name}</h2>
            {profile.running && (
              <div
                className="w-2 h-2 bg-apricot rounded-full animate-pulse shrink-0"
                title="Syncing"
              />
            )}
          </div>
          <div className="text-amethyst-smoke text-sm truncate">
            {serverOf(profile)}
          </div>
        </div>
        <IconButton
          onClick={onTest}
          disabled={test?.testing}
          title="Test connection"
        >
          <Icon title={test?.testing ? "arrow_repeat" : "reception_4"} />
        </IconButton>
        <IconButton onClick={onLog} title="Show logs">
          <Icon title="terminal" />
        </IconButton>
        <IconButton onClick={onEdit} title="Edit profile">
          <Icon title="gear_wide_connected" />
        </IconButton>
      </div>

      {result && <Status result={result} onResolve={onResolve} />}

      {test?.message && (
        <div
          className={`text-sm mt-1 wrap-break-word ${
            test.ok ? "text-lilac" : "text-dusty-rose"
          }`}
        >
          {test.message}
        </div>
      )}

      <div className="mt-2 flex gap-1">
        <Button
          className="flex-1 text-sm bg-persian-blue/40 hover:bg-persian-blue/50 text-blanched-almond"
          onClick={onSync}
          disabled={profile.running}
        >
          {profile.running ? "Syncing..." : "Sync now"}
        </Button>
        <Button
          className="text-sm bg-jet-black hover:bg-jet-black/90 active:bg-dusty-grape/20 flex items-center gap-2"
          onClick={onAutoSync}
          title="Sync on open, save, file changes and app resume"
        >
          <CheckIcon checked={profile.autoSync} size={16} />
          Auto
        </Button>
      </div>

      <div className="text-amethyst-smoke text-xs mt-1">
        <i>
          {result
            ? `Last synced ${prettyDateTime(new Date(result.finishedAt))}`
            : "Never synced"}
        </i>
      </div>
    </Box>
  );
};

/** The last sync in a few words, instead of unison's summary line */
const Status = ({
  result,
  onResolve,
}: {
  result: SyncResult;
  onResolve: (path: string) => void;
}) => {
  const conflicts = result.conflicts.length;
  const failed = result.failedPaths?.length || result.failed;
  const problem =
    result.error ??
    (conflicts
      ? `${plural(conflicts, "conflict")} to resolve`
      : failed
      ? `${plural(failed, "file")} failed to sync`
      : null);

  return (
    <div className="text-sm mt-1">
      {problem ? (
        <div className="text-dusty-rose wrap-break-word">{problem}</div>
      ) : (
        <div className="text-lilac">
          {result.transferred
            ? `Synced ${plural(result.transferred, "file")}`
            : "Up to date"}
        </div>
      )}
      {result.conflicts.map((path) => (
        <div key={path} className="flex items-center gap-2 mt-1">
          <span className="flex-1 truncate text-desert-sand">{path}</span>
          <Chip className="text-white" onClick={() => onResolve(path)}>
            Resolve
          </Chip>
        </div>
      ))}
    </div>
  );
};

/** "me@example.com" for ssh://me@example.com:2222//srv/... */
const serverOf = (profile: Profile) => {
  for (const root of profile.roots) {
    try {
      const { protocol, user, host } = parseRoot(root);
      if (protocol !== "file" && host) return user ? `${user}@${host}` : host;
    } catch {
      // Not parseable: shown as text in the profile's settings
    }
  }
  return "";
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
