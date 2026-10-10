import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useSearchParams } from "react-router-dom";
import tw from "tailwind-styled-components";
import { Button, PRIMARY, SECONDARY } from "../fragments/Button";
import { Column, Input, Label, Row, SubHeader, TextArea, Wrapper } from "../fragments/Elements";
import { Modal } from "../fragments/Modal";
import { IconButton, Page } from "../fragments/Page";
import { Icon } from "../icons/icon";
import { Unison } from "../plugins/unison";
import { useUnisonStore } from "../stores/unisonStore";
import {
  Issue,
  Profile,
  Root,
  formatRoot,
  parseProfile,
  parseRoot,
  serializeProfile,
  setValues,
  validateProfile,
  valuesOf,
} from "../unison/profile";
import { ANDROID, OFFERED, PREFS, PrefSpec, SECTIONS, canonical } from "../unison/schema";
import { resolveSshHost, sshHosts } from "../unison/sshConfig";
import { FieldShell, Issues, PrefField } from "./PrefFields";

const PROFILE_NAME = /^[A-Za-z0-9._-]+$/;

const NEW_PROFILE = `root = /storage/emulated/0/Documents/org
root = ssh://
batch = true
fat = true
`;

const LINK_BUTTON = "text-amethyst-smoke hover:text-white text-sm mt-2";
const DANGER = "bg-dusty-rose/20 hover:bg-dusty-rose/30 text-dusty-rose";

/** /profile (new) or /profile?name=org-files; one page per profile */
export const ProfileRoute = () => {
  const [params] = useSearchParams();
  const name = params.get("name");
  return <ProfilePage key={name ?? ""} existing={name} />;
};

/**
 * Add/configure a unison profile with fields for unison's own preferences,
 * validated like unison loads profiles. The profile text stays the source of
 * truth, so comments and includes from a computer are kept.
 */
const ProfilePage = ({ existing }: { existing: string | null }) => {
  const navigate = useNavigate();
  const { profiles, refresh, saveProfile, deleteProfile } = useUnisonStore();

  const [name, setName] = useState(existing ?? "org-files");
  const [doc, setDoc] = useState<Profile | null>(existing ? null : parseProfile(NEW_PROFILE));
  const [savedText, setSavedText] = useState(existing ? "" : NEW_PROFILE);
  const [asText, setAsText] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [sshConfig, setSshConfig] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!profiles.length) refresh();
    if (existing) {
      Unison.readProfile({ name: existing })
        .then((p) => {
          setDoc(parseProfile(p.text));
          setSavedText(p.text);
        })
        .catch((e) => setError(String(e)));
    }
    Unison.readSshFile({ name: "config" })
      .then((f) => setSshConfig(f.text))
      .catch(() => setSshConfig(""));
  }, [existing]);

  // Leaving with unsaved changes (back button too) asks first
  const dirty = useRef(false);
  dirty.current = !!doc && (serializeProfile(doc) !== savedText || (!existing && name !== "org-files"));
  const blocker = useBlocker(() => dirty.current);

  const otherNames = profiles.map((p) => p.name).filter((n) => n !== existing);
  const issues = useMemo(() => (doc ? validateProfile(doc, profiles.map((p) => p.name)) : []), [doc, profiles]);
  const nameError = existing
    ? null
    : !PROFILE_NAME.test(name)
      ? "Use letters, digits, '.', '_' or '-'"
      : otherNames.includes(name)
        ? `~/.unison/${name}.prf already exists`
        : null;

  const save = async () => {
    if (!doc) return false;
    if (nameError) {
      setError(nameError);
      return false;
    }
    if (issues.some((i) => i.severity === "error")) {
      setError("Fix the errors above first; unison would refuse this profile.");
      return false;
    }
    try {
      await saveProfile(existing ?? name, serializeProfile(doc));
      dirty.current = false;
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  };

  const remove = async () => {
    await deleteProfile(existing!);
    dirty.current = false;
    navigate(-1);
  };

  const title = existing ?? "New profile";
  if (!doc) {
    return (
      <Page title={title}>
        <div className="text-center text-amethyst-smoke p-4">{error ?? "Loading..."}</div>
      </Page>
    );
  }

  const roots = valuesOf(doc, "root");
  const set = (pref: string, values: string[]) => setDoc((d) => d && setValues(d, pref, values));
  const field = (spec: PrefSpec) => (
    <PrefField
      key={spec.name}
      spec={spec}
      values={valuesOf(doc, spec.name)}
      onChange={(values) => set(spec.name, withoutDefault(spec, values, doc))}
      issues={issues.filter((i) => i.pref === spec.name)}
      roots={roots}
    />
  );

  const section = ({ title, prefs }: (typeof SECTIONS)[number]) => (
    <Section key={title}>
      <SubHeader>{title}</SubHeader>
      {prefs.map((name) => field(PREFS[name]))}
    </Section>
  );
  // Set in the file but not offered here (e.g. Linux-only options): edit as text.
  // Options Nouture handles itself (batch) are expected there, so not listed.
  const textOnly = [
    ...new Set(
      doc.lines.flatMap((l) => {
        const name = l.kind === "pref" ? canonical(l.name) : "";
        return name && !OFFERED.has(name) && ANDROID[name]?.level !== "managed" ? [name] : [];
      })
    ),
  ];
  const generalIssues = issues.filter((i) => !i.pref || !OFFERED.has(i.pref));

  return (
    <Page
      title={title}
      actions={
        <IconButton onClick={() => save().then((ok) => ok && navigate(-1))} title="Save">
          <Icon title="save" />
        </IconButton>
      }
    >
      <Section>
        <SubHeader>Profile</SubHeader>
        {!existing && (
          <>
            <FieldLabel>Name</FieldLabel>
            <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
            {nameError && <div className="text-dusty-rose text-sm mt-1">{nameError}</div>}
          </>
        )}
        <div className="text-amethyst-smoke text-sm mt-2">
          <i>
            ~/.unison/{existing ?? name}.prf, run as: unison {existing ?? name} -batch
          </i>
        </div>
        <Button className={`self-start ${LINK_BUTTON}`} onClick={() => setAsText(!asText)}>
          {asText ? "Edit with fields" : "Edit as text"}
        </Button>
        {!asText && <Issues issues={generalIssues} lines />}
        {!asText && textOnly.length > 0 && (
          <div className="text-xs text-amethyst-smoke mt-1">
            Also set in this profile (edit as text): {textOnly.join(", ")}
          </div>
        )}
      </Section>

      {asText ? (
        <Section>
          <SubHeader>~/.unison/{existing ?? name}.prf</SubHeader>
          <TextArea
            className="w-full mt-1"
            rows={16}
            value={serializeProfile(doc)}
            spellCheck={false}
            autoCapitalize="off"
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDoc(parseProfile(e.target.value))}
          />
          <Issues issues={issues} lines />
        </Section>
      ) : (
        <>
          <Section>
            <SubHeader>Roots</SubHeader>
            <RootsField
              roots={roots}
              sshConfig={sshConfig}
              issues={issues.filter((i) => i.pref === "root")}
              onChange={(values) => set("root", values)}
              androidExtra={field(PREFS.fat)}
            />
          </Section>

          {SECTIONS.filter((s) => !s.advanced).map(section)}

          <div className="text-center mb-6">
            <Button className={LINK_BUTTON} onClick={() => setAdvanced(!advanced)}>
              {advanced ? "Hide" : "Show"} Advanced Settings
            </Button>
          </div>
          {advanced && SECTIONS.filter((s) => s.advanced).map(section)}
        </>
      )}

      <div className="px-4 pb-8">
        {error && <div className="text-dusty-rose text-sm mb-2">{error}</div>}
        <div className="flex gap-1">
          {existing && (
            <Button className={DANGER} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
          <Button className={`flex-1 ${PRIMARY}`} onClick={() => save().then((ok) => ok && navigate(-1))}>
            Save
          </Button>
        </div>
      </div>

      <Modal
        title="Delete profile?"
        description={`~/.unison/${existing}.prf will be removed. The synced files stay where they are.`}
        show={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        footer={
          <Button className={`${DANGER} mr-auto`} onClick={remove}>
            Delete
          </Button>
        }
      />

      <Modal
        title="Unsaved changes"
        description={`Save ~/.unison/${existing ?? name}.prf before leaving?`}
        show={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        onSave={() =>
          save().then((ok) => (ok ? blocker.proceed?.() : blocker.reset?.()))
        }
        footer={
          <Button className={`${SECONDARY} mr-auto`} onClick={() => blocker.proceed?.()}>
            Discard
          </Button>
        }
      />
    </Page>
  );
};

/** Labels stand out from the hints below them, like the option names */
const FieldLabel = tw(Label)`text-blanched-almond`;

/** A page section, like the ones on the home screen; fields stack in a column */
const Section = ({ children }: { children: React.ReactNode }) => (
  <Wrapper className="rounded-lg mb-6 shadow-lg">
    <Column>{children}</Column>
  </Wrapper>
);

/**
 * The two roots: a folder on Android and the server, as separate fields.
 * Profiles shaped differently fall back to plain root fields.
 */
const RootsField = ({
  roots,
  sshConfig,
  issues,
  onChange,
  androidExtra,
}: {
  roots: string[];
  /** ~/.ssh/config, for host suggestions and what an empty field means */
  sshConfig: string;
  issues: Issue[];
  onChange: (roots: string[]) => void;
  /** Fields shown with the Android root */
  androidExtra: React.ReactNode;
}) => {
  const parsed = roots.map((r) => {
    try {
      return parseRoot(r);
    } catch {
      return null;
    }
  });
  const localIndex = parsed.findIndex((r) => r?.protocol === "file" && !r.host);
  const remoteIndex = roots.findIndex((r, i) => i !== localIndex && /^ssh:\/\//.test(r));
  const structured = roots.length === 2 && localIndex >= 0 && remoteIndex >= 0;

  if (!structured) {
    return (
      <FieldShell spec={PREFS.root} issues={issues}>
        {[0, 1].map((i) => (
          <Input
            key={i}
            className="mt-1"
            value={roots[i] ?? ""}
            placeholder={i === 0 ? "/storage/emulated/0/Documents/org" : "ssh://host//path/to/org"}
            inputMode="url"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const next = [roots[0] ?? "", roots[1] ?? ""];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
        ))}
        {androidExtra}
      </FieldShell>
    );
  }

  // ssh://host is incomplete while typing, so parse what's there by hand
  const remote: Root = parsed[remoteIndex] ?? { protocol: "ssh", ...partialSsh(roots[remoteIndex]) };
  // Empty user/port fields fall back to ~/.ssh/config: show those as placeholders
  const hosts = sshHosts(sshConfig);
  const resolved = remote.host ? resolveSshHost(sshConfig, remote.host) : {};
  // Only characters clroot.ml allows in each part, so "/", ":" or "@" can't
  // shift the boundaries between them (IPv6/sockets: edit as text)
  const only = (allowed: RegExp) => (e: React.ChangeEvent<HTMLInputElement>) =>
    [...e.target.value].filter((c) => allowed.test(c)).join("") || undefined;
  const setRemote = (change: Partial<Root>) => {
    const next = [...roots];
    next[remoteIndex] = formatRoot({ ...remote, ...change, protocol: "ssh" });
    onChange(next);
  };
  const setLocal = (path: string) => {
    const next = [...roots];
    next[localIndex] = path;
    onChange(next);
  };
  return (
    <>
      <FieldLabel>Android</FieldLabel>
      {/* The URL keyboard has "/" next to the space bar (and ".com" for hosts) */}
      <Input
        value={roots[localIndex]}
        placeholder="/storage/emulated/0/Documents/org"
        inputMode="url"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocal(e.target.value)}
      />
      <div className="text-xs text-amethyst-smoke mt-1">
        A folder in shared storage, so other editors can open the notes too
      </div>
      {androidExtra}

      <Row>
        <Column className="flex-1">
          <FieldLabel>Server</FieldLabel>
          <Input
            value={remote.host ?? ""}
            placeholder={hosts[0] ?? "example.com"}
            list="nouture-ssh-hosts"
            inputMode="url"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemote({ host: only(/[-_a-zA-Z0-9%.]/)(e) })}
          />
          <datalist id="nouture-ssh-hosts">
            {hosts.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        </Column>
        <Column>
          <FieldLabel>Port</FieldLabel>
          <Input
            style={{ width: "60px" }}
            value={remote.port ?? ""}
            placeholder={resolved.port ?? "22"}
            inputMode="numeric"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemote({ port: only(/[0-9]/)(e) })}
          />
        </Column>
      </Row>
      <FieldLabel>User</FieldLabel>
      <Input
        value={remote.user ?? ""}
        placeholder={resolved.user}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemote({ user: only(/[-_a-zA-Z0-9.%]/)(e) })}
      />
      <FieldLabel>Path on the server</FieldLabel>
      <Input
        value={remote.path ?? ""}
        placeholder="/path/to/org"
        inputMode="url"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemote({ path: e.target.value || undefined })}
      />
      <div className="text-xs text-amethyst-smoke mt-1">
        Start with / for an absolute path, otherwise it's relative to the home directory
      </div>
      <div className="text-xs text-desert-sand font-mono break-all mt-1">root = {roots[remoteIndex]}</div>
      <Issues issues={issues} />
    </>
  );
};

/** Fields of an ssh:// root that doesn't parse yet (e.g. no host typed) */
const partialSsh = (root: string): Partial<Root> => {
  const m = /^ssh:\/\/(?:([^@/]+)@)?([^:/]*)(?::([^/]*))?(?:\/(.*))?$/.exec(root);
  return m ? { user: m[1], host: m[2] || undefined, port: m[3], path: m[4] } : {};
};

/**
 * Setting a single-valued preference back to unison's default removes its
 * line, unless includes might set it otherwise.
 */
const withoutDefault = (spec: PrefSpec, values: string[], doc: Profile) => {
  const includes = doc.lines.some((l) => l.kind === "directive");
  const isDefault =
    values.length === 1 &&
    (spec.kind === "boolDefault"
      ? values[0] === "default"
      : spec.default !== null && spec.default !== undefined && values[0] === String(spec.default));
  return isDefault && !includes && spec.kind !== "stringList" && spec.kind !== "pattern" ? [] : values;
};
