import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../fragments/Button";
import { Box, Column, SubHeader, Wrapper } from "../fragments/Elements";
import { Modal } from "../fragments/Modal";
import { IconButton } from "../fragments/Page";
import { Icon } from "../icons/icon";
import { HostKey, Profile, Unison } from "../plugins/unison";
import { useUnisonStore } from "../stores/unisonStore";
import { prettyDateTime } from "../utils/date";
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
  const [hostKey, setHostKey] = useState<{ profile: string; key: HostKey } | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const test = async (name: string) => {
    setTests((t) => ({ ...t, [name]: { testing: true } }));
    try {
      await Unison.requestLocalNetwork();
      const result = await Unison.testConnection({ name });
      setTests((t) => ({ ...t, [name]: { ok: result.ok, message: result.message } }));
      if (result.unknownHostKey) setHostKey({ profile: name, key: result.unknownHostKey });
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
                onEdit={() => navigate(`/profile?name=${encodeURIComponent(profile.name)}`)}
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
            <span className="text-navajo-white break-all">{hostKey.key.host}</span>
            <span className="text-amethyst-smoke text-sm">{hostKey.key.type}</span>
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
  onLog,
  onSync,
  onAutoSync,
}: {
  profile: Profile;
  test?: TestState;
  onTest: () => void;
  onEdit: () => void;
  onLog: () => void;
  onSync: () => void;
  onAutoSync: () => void;
}) => {
  const result = profile.lastResult;
  const failed = !!result && (!!result.error || result.exitCode !== 0);

  return (
    <Box className={profile.running ? "border-apricot" : ""}>
      <div className="absolute top-0 right-0 flex gap-1">
        <IconButton onClick={onTest} disabled={test?.testing} title="Test connection">
          <Icon title={test?.testing ? "arrow_repeat" : "reception_4"} />
        </IconButton>
        <IconButton onClick={onLog} title="Sync log">
          <Icon title="terminal" />
        </IconButton>
        <IconButton onClick={onEdit} title="Edit profile">
          <Icon title="gear_wide_connected" />
        </IconButton>
      </div>

      <div className="flex items-center justify-center gap-2 mb-1 mt-4">
        {profile.running && (
          <div
            className="w-2 h-2 bg-apricot rounded-full animate-pulse"
            title="Syncing"
          />
        )}
        <h2>{profile.name}</h2>
      </div>

      <div className="text-amethyst-smoke text-sm break-all">
        {profile.roots.join(" ⇄ ")}
      </div>

      <div className="text-amethyst-smoke text-sm mt-1">
        <i>
          Last synced:{" "}
          {result ? prettyDateTime(new Date(result.finishedAt)) : "never"}
        </i>
      </div>

      {result && (
        <div className={`text-sm mt-1 wrap-break-word ${failed ? "text-dusty-rose" : "text-lilac"}`}>
          {result.error ?? result.summary ?? `unison exited with code ${result.exitCode}`}
          {result.conflicts.map((path) => (
            <div key={path}>Conflict: {path}</div>
          ))}
        </div>
      )}

      {test?.message && (
        <div className={`text-sm mt-1 wrap-break-word ${test.ok ? "text-lilac" : "text-dusty-rose"}`}>
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
          <Icon title={profile.autoSync ? "toggle_on" : "toggle_off"} />
          Auto
        </Button>
      </div>
    </Box>
  );
};
