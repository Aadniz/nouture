import { useEffect, useState } from "react";
import { Button, Chip } from "../fragments/Button";
import {
  Column,
  Input,
  Label,
  Output,
  Row,
  SubHeader,
  TextArea,
  Wrapper,
} from "../fragments/Elements";
import { Modal } from "../fragments/Modal";
import { IconButton } from "../fragments/Page";
import { Icon } from "../icons/icon";
import { SshFile, SshKey, Unison } from "../plugins/unison";
import { useUnisonStore } from "../stores/unisonStore";

const CONFIG_PLACEHOLDER = `Host myserver
  HostName example.com
  Port 22
  User me`;

type KeyModal = "generate" | "import" | null;

export const SshSettings = () => {
  // Shared: the profiles above can't sync over SSH without a key
  const keys = useUnisonStore((s) => s.keys);
  const refresh = useUnisonStore((s) => s.refreshKeys);
  const [file, setFile] = useState<SshFile | null>(null);
  const [keyModal, setKeyModal] = useState<KeyModal>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const copy = async (key: SshKey) => {
    await navigator.clipboard.writeText(key.publicKey);
    setCopied(key.name);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <>
      <Wrapper className="rounded-lg shadow-lg mt-6">
        <SubHeader>SSH</SubHeader>

        {keys.map((key) => (
          <Row key={key.name} className="items-center" title={key.fingerprint}>
            <span className="text-amethyst-smoke px-2">
              <Icon title="key" />
            </span>
            <span className="flex-1 truncate font-mono text-sm text-desert-sand">~/.ssh/{key.name}</span>
            <IconButton onClick={() => copy(key)} title="Copy public key">
              <Icon title={copied === key.name ? "check2" : "clipboard"} />
            </IconButton>
            <IconButton onClick={() => Unison.deleteKey({ name: key.name }).then(refresh)} title="Delete key">
              <Icon title="trash3" />
            </IconButton>
          </Row>
        ))}
        {keys.length === 0 && (
          <div className="text-amethyst-smoke text-sm px-2 mb-1">
            No key yet: make one and add it to the server's authorized_keys.
          </div>
        )}

        <div className="flex flex-wrap gap-1 mt-1">
          <Chip onClick={() => setKeyModal("generate")}>New key</Chip>
          <Chip onClick={() => setKeyModal("import")}>Import</Chip>
          <Chip onClick={() => setFile("config")}>config</Chip>
          <Chip onClick={() => setFile("known_hosts")}>known_hosts</Chip>
        </div>
      </Wrapper>

      <SshFileModal file={file} onClose={() => setFile(null)} />
      <KeyModal
        mode={keyModal}
        onClose={() => setKeyModal(null)}
        onCreated={refresh}
      />
    </>
  );
};

const SshFileModal = ({
  file,
  onClose,
}: {
  file: SshFile | null;
  onClose: () => void;
}) => {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset when opened; the modal stays mounted so its popup animation runs
  useEffect(() => {
    if (!file) return;
    setError(null);
    Unison.readSshFile({ name: file }).then((f) => setText(f.text));
  }, [file]);

  const save = () =>
    Unison.writeSshFile({ name: file!, text })
      .then(onClose)
      .catch((e) => setError(String(e)));

  return (
    <Modal
      title={`~/.ssh/${file ?? ""}`}
      description={
        file === "config"
          ? "Host, HostName, Port, User and IdentityFile work like in OpenSSH."
          : "One trusted host key per line, as OpenSSH writes them."
      }
      show={!!file}
      onClose={onClose}
      onSave={save}
    >
      <Column className="w-[70vw]">
        <TextArea
          rows={10}
          value={text}
          placeholder={file === "config" ? CONFIG_PLACEHOLDER : ""}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
        />
        {error && <div className="text-dusty-rose text-sm mt-1">{error}</div>}
      </Column>
    </Modal>
  );
};

const KeyModal = ({
  mode,
  onClose,
  onCreated,
}: {
  mode: KeyModal;
  onClose: () => void;
  onCreated: () => void;
}) => {
  const [name, setName] = useState("id_ed25519");
  const [privateKey, setPrivateKey] = useState("");
  const [created, setCreated] = useState<SshKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset when opened; the modal stays mounted so its popup animation runs
  useEffect(() => {
    if (!mode) return;
    setName(mode === "import" ? "id_imported" : "id_ed25519");
    setPrivateKey("");
    setCreated(null);
    setError(null);
  }, [mode]);

  const create = async () => {
    try {
      const key =
        mode === "import"
          ? await Unison.importKey({ name, privateKey })
          : await Unison.generateKey({ name });
      setCreated(key);
      onCreated();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <Modal
      title={mode === "import" ? "Import private key" : "Generate ed25519 key"}
      description={
        created
          ? "Add this line to ~/.ssh/authorized_keys on the server."
          : mode === "import"
            ? "Paste an unencrypted OpenSSH private key."
            : "Like ssh-keygen -t ed25519, stored in this app only."
      }
      show={!!mode}
      onClose={onClose}
      onSave={created ? undefined : create}
      saveLabel={mode === "import" ? "Import" : "Generate"}
      footer={
        created && (
          <Button
            className="bg-amethyst-smoke hover:bg-amethyst-smoke/90 active:bg-lavender-grey/80"
            onClick={() => navigator.clipboard.writeText(created.publicKey)}
          >
            Copy
          </Button>
        )
      }
    >
      <Column className="w-[70vw]">
        {created ? (
          <Output>{created.publicKey}</Output>
        ) : (
          <>
            <Label>Name in ~/.ssh/</Label>
            <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
            {mode === "import" && (
              <>
                <Label>Private key</Label>
                <TextArea
                  rows={8}
                  value={privateKey}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  spellCheck={false}
                  autoCapitalize="off"
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrivateKey(e.target.value)}
                />
              </>
            )}
          </>
        )}
        {error && <div className="text-dusty-rose text-sm mt-1">{error}</div>}
      </Column>
    </Modal>
  );
};
