import { useEffect, useState } from "react";
import { Button } from "../fragments/Button";
import { Column, Label, Output } from "../fragments/Elements";
import { Modal } from "../fragments/Modal";
import { Unison } from "../plugins/unison";
import { useUnisonStore } from "../stores/unisonStore";

/** The latest run's output, like Emacs' *unison-sync* buffer, plus unison.log. */
export const SyncLog = ({
  profile,
  onClose,
}: {
  profile: string | null;
  onClose: () => void;
}) => {
  const live = useUnisonStore((s) => (profile ? s.output[profile] : undefined));
  const last = useUnisonStore(
    (s) => s.profiles.find((p) => p.name === profile)?.lastResult
  );
  const [log, setLog] = useState<string | null>(null);

  useEffect(() => setLog(null), [profile]);

  const lines = live?.length ? live : last?.output ?? [];

  return (
    <Modal
      title={profile ? `unison ${profile}` : undefined}
      show={!!profile}
      onClose={onClose}
      footer={
        <Button
          className="bg-jet-black hover:bg-jet-black/90 active:bg-dusty-grape/20"
          onClick={() =>
            Unison.readLog({ lines: 200 }).then((l) => setLog(l.text))
          }
        >
          unison.log
        </Button>
      }
    >
      <Column className="w-[70vw] gap-1">
        <Output>{lines.length ? lines.join("\n") : "No sync has run yet."}</Output>
        {log !== null && (
          <>
            <Label>~/.unison/unison.log</Label>
            <Output>{log || "(empty)"}</Output>
          </>
        )}
      </Column>
    </Modal>
  );
};
