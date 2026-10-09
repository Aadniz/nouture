import { useEffect, useState } from "react";
import { Button } from "../fragments/Button";
import {
  Box,
  Column,
  Input,
  Label,
  Output,
  SubHeader,
  TextArea,
  Wrapper,
} from "../fragments/Elements";
import { Modal } from "../fragments/Modal";
import { IconButton } from "../fragments/Page";
import { Icon } from "../icons/icon";
import { SshFile, SshKey, Unison } from "../plugins/unison";

const CONFIG_PLACEHOLDER = `Host myserver
  HostName example.com
  Port 22
  User me`;

type KeyModal = "generate" | "import" | null;

export const SshSettings = () => {
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [file, setFile] = useState<SshFile | null>(null);
  const [keyModal, setKeyModal] = useState<KeyModal>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = () => Unison.listKeys().then((k) => setKeys(k.keys));

  useEffect(() => {
    refresh();
  }, []);

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
          <Box key={key.name}>
            <div className="absolute top-0 right-0 flex gap-1">
              <IconButton onClick={() => copy(key)} title="Copy public key">
                <Icon title={copied === key.name ? "check2" : "clipboard"} />
              </IconButton>
              <IconButton
                onClick={() => Unison.deleteKey({ name: key.name }).then(refresh)}
                title="Delete key"
              >
                <Icon title="trash3" />
              </IconButton>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Icon title="key" />
              <h2>~/.ssh/{key.name}</h2>
            </div>
            <div className="text-amethyst-smoke text-xs font-mono break-all mt-1">
              {key.fingerprint}
            </div>
          </Box>
        ))}
        {keys.length === 0 && (
          <div className="text-center text-amethyst-smoke p-4 text-sm">
            Generate a key for this phone and add its public key to the
            server's ~/.ssh/authorized_keys.
          </div>
        )}

        <div className="grid grid-cols-2 gap-1 m-2">
          <Button
            className="bg-amethyst-smoke hover:bg-amethyst-smoke/90 active:bg-lavender-grey/80"
            onClick={() => setKeyModal("generate")}
          >
            Generate key
          </Button>
          <Button
            className="bg-jet-black hover:bg-jet-black/90 active:bg-dusty-grape/20"
            onClick={() => setKeyModal("import")}
          >
            Import key
          </Button>
          <Button
            className="bg-jet-black hover:bg-jet-black/90 active:bg-dusty-grape/20"
            onClick={() => setFile("config")}
          >
            ~/.ssh/config
          </Button>
          <Button
            className="bg-jet-black hover:bg-jet-black/90 active:bg-dusty-grape/20"
            onClick={() => setFile("known_hosts")}
          >
            known_hosts
          </Button>
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
