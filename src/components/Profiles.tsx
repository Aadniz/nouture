import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Chip } from "../fragments/Button";
import { CheckIcon } from "../fragments/Checkbox";
import { Box, Column, SubHeader, Wrapper } from "../fragments/Elements";
import { Modal } from "../fragments/Modal";
import { IconButton } from "../fragments/Page";
import { Icon } from "../icons/icon";
import { HostKey, Profile, SyncResult, Unison } from "../plugins/unison";
import { completed, useUnisonStore } from "../stores/unisonStore";
import { parseRoot } from "../unison/profile";
import { prettyDateTime } from "../utils/date";
import { conflictPath } from "./ConflictPage";
import { SyncLog } from "./SyncLog";

interface TestState {
  testing?: boolean;
  ok?: boolean;
  message?: string;
  /** When it finished: whichever is newer, this or the last sync, is shown */
  at?: number;
}

export const Profiles = () => {
  const navigate = useNavigate();
  const { profiles, error, keys, refresh, refreshKeys, sync, setAutoSync } = useUnisonStore();
  const [logFor, setLogFor] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [hostKey, setHostKey] = useState<{
    profile: string;
    key: HostKey;
  } | null>(null);
  /** Host keys asked about this session: closing the popup means "not now" */
  const asked = useRef(new Set<string>());

  useEffect(() => {
    refresh();
    refreshKeys();
  }, [refresh, refreshKeys]);

  const askAbout = (profile: string, key: HostKey) => {
    asked.current.add(key.fingerprint);
    setHostKey({ profile, key });
  };

  // A sync stopped at a server that isn't trusted yet: ask about its key right
  // away, unless it was trusted since (the failed result is still the last one)
  useEffect(() => {
    if (hostKey) return;
    const waiting = profiles.find((p) => {
      const key = p.lastResult?.unknownHostKey;
      return key && !asked.current.has(key.fingerprint);
    });
    const key = waiting?.lastResult?.unknownHostKey;
    if (!waiting || !key) return;
    asked.current.add(key.fingerprint);
    Unison.readSshFile({ name: "known_hosts" })
      .then(({ text }) => text.includes(key.key))
      .catch(() => false)
      .then((trusted) => trusted || askAbout(waiting.name, key));
  }, [profiles, hostKey]);

  const test = async (name: string) => {
    setTests((t) => ({ ...t, [name]: { testing: true } }));
    try {
      await Unison.requestLocalNetwork();
      const result = await Unison.testConnection({ name });
      setTests((t) => ({
        ...t,
        [name]: { ok: result.ok, message: result.message, at: Date.now() },
      }));
      if (result.unknownHostKey) askAbout(name, result.unknownHostKey);
    } catch (e) {
      setTests((t) => ({ ...t, [name]: { ok: false, message: String(e), at: Date.now() } }));
    }
  };

  const runSync = (name: string) => Unison.requestLocalNetwork().then(() => sync(name));

  /** Asked for by hand: a host key closed with "not now" may be asked about again */
  const syncNow = (name: string) => {
    asked.current.clear();
    runSync(name);
  };

  const trust = async () => {
    if (!hostKey) return;
    const { fingerprint: _, ...key } = hostKey.key;
    await Unison.trustHost(key);
    setHostKey(null);
    // A sync that stopped at this key goes again (it can't get further
    // without a key); otherwise check the connection
    const profile = profiles.find((p) => p.name === hostKey.profile);
    if (profile?.lastResult?.unknownHostKey && keys.length > 0) runSync(hostKey.profile);
    else test(hostKey.profile);
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
                hasKey={keys.length > 0}
                onTest={() => test(profile.name)}
                onEdit={() =>
                  navigate(`/profile?name=${encodeURIComponent(profile.name)}`)
                }
                onResolve={(path) => navigate(conflictPath(profile.name, path))}
                onLog={() => setLogFor(profile.name)}
                onSync={() => syncNow(profile.name)}
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
          <Column className="w-[70vw] gap-1 text-center">
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
  hasKey,
  onTest,
  onEdit,
  onResolve,
  onLog,
  onSync,
  onAutoSync,
}: {
  profile: Profile;
  test?: TestState;
  /** Any key in ~/.ssh: without one, an SSH profile can't sync */
  hasKey: boolean;
  onTest: () => void;
  onEdit: () => void;
  onResolve: (path: string) => void;
  onLog: () => void;
  onSync: () => void;
  onAutoSync: () => void;
}) => {
  const result = profile.lastResult;
  const needsKey = usesSsh(profile) && !hasKey;
  // A connection test after the last sync says more than that sync's error
  const testIsNewer = !!test?.at && (!result || test.at > result.finishedAt);
  const failedSince =
    result && !completed(result) && (!profile.lastSyncedAt || result.finishedAt > profile.lastSyncedAt);

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

      {result && <Status result={result} hideError={testIsNewer} onResolve={onResolve} />}

      {testIsNewer && test?.message && (
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
          className="flex-1 text-sm bg-persian-blue/40 hover:bg-persian-blue/50 text-blanched-almond disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onSync}
          disabled={profile.running || needsKey}
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

      {needsKey && (
        <div className="text-amethyst-smoke text-sm mt-1">
          Syncing over SSH needs a key: make or import one under SSH below, and add it to the
          server's authorized_keys.
        </div>
      )}

      <div className="text-amethyst-smoke text-xs mt-1">
        <i>
          {profile.lastSyncedAt
            ? `Last synced ${prettyDateTime(new Date(profile.lastSyncedAt))}`
            : "Never synced"}
          {failedSince && `, last try failed ${prettyDateTime(new Date(result.finishedAt))}`}
        </i>
      </div>
    </Box>
  );
};

/** The last sync in a few words, instead of unison's summary line */
const Status = ({
  result,
  hideError,
  onResolve,
}: {
  result: SyncResult;
  /** A newer connection test replaces the sync's error */
  hideError?: boolean;
  onResolve: (path: string) => void;
}) => {
  if (hideError && result.error) return null;
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

/** Any root reached over SSH */
const usesSsh = (profile: Profile) =>
  profile.roots.some((root) => {
    try {
      return parseRoot(root).protocol === "ssh";
    } catch {
      return false;
    }
  });

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
