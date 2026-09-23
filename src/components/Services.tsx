import { Capacitor } from "@capacitor/core";
import { Input, SubHeader, Wrapper } from "../fragments/Elements";
import { prettyDateTime } from "../utils/date";
import tw from "tailwind-styled-components";
import { Button } from "../fragments/Button";
import { useState } from "react";
import { Modal } from "../fragments/Modal";
import { Icon } from "../icons/icon";
import { useSFTPStore } from "../stores/SFTPStore";
import type { SFTPConnectionConfig } from "../plugins/sftp";

// Types
interface Service {
  id: string;
  name?: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  lastSynced?: number | null;
  remotePath?: string;
  isConnected?: boolean;
}

type AddService = Omit<Service, "id" | "lastSynced" | "isConnected">;

const DEFAULT_SERVICE: AddService = {
  host: "",
  port: 22,
  username: "",
  name: "",
  remotePath: "/home/user/org-notes",
};

export const Services = () => {
  const platform = Capacitor.getPlatform();
  const [serviceModal, setServiceModal] = useState<Service | boolean>(false);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);

  const {
    connectionConfig: s,
    isConnected,
    connect,
    disconnect,
    setConnectionConfig,
    syncNotes,
  } = useSFTPStore();

  const handleConnect = async (service: Service) => {
    if (service.isConnected) {
      await disconnect();
    } else {
      setConnectionConfig({
        host: service.host,
        port: service.port,
        username: service.username,
        password: service.password,
      });
      await connect();
      if (useSFTPStore.getState().isConnected) {
        // Auto-sync on successful connection
        await syncNotes(
          service.remotePath || "/home/user/org-notes",
          `notes/${service.id}`
        );
      }
    }
  };

  const handleTestConnection = async (service: Service) => {
    setTestingConnection(true);
    try {
      setConnectionConfig({
        host: service.host,
        port: service.port,
        username: service.username,
        password: service.password,
      });
      await connect();
    } finally {
      setTestingConnection(false);
    }
  };

  console.log("The service:", s);

  return (
    <>
      <Wrapper className="rounded-lg shadow-lg">
        <SubHeader>Services</SubHeader>
        {s === null ? (
          <div className="text-center text-amethyst-smoke p-4">
            <p>No services configured yet.</p>
            <p className="text-sm mt-2">
              Add an SFTP service to sync your org notes.
            </p>
          </div>
        ) : (
          <div className="grid">
            <Box
              className={`relative ${isConnected ? "border-green-500" : ""}`}
            >
              <div className="absolute top-0 right-0 flex gap-1">
                <Button
                  className="text-white/80 hover:text-white/70 active:text-lavender-grey"
                  onClick={() => handleTestConnection(s as Service)}
                  disabled={testingConnection}
                  title="Test connection"
                >
                  <Icon
                    title={testingConnection ? "arrow_repeat" : "reception_4"}
                  />
                </Button>
                <Button
                  className="text-white/80 hover:text-white/70 active:text-lavender-grey"
                  onClick={() => setServiceModal(s as Service)}
                >
                  <Icon title="gear_wide_connected" />
                </Button>
              </div>

              <div className="flex items-center justify-center gap-2 mb-1">
                {isConnected && (
                  <div
                    className="w-2 h-2 bg-green-500 rounded-full"
                    title="Connected"
                  />
                )}
                <h2>{`${s.host}:${s.port}`}</h2>
              </div>

              <div className="text-amethyst-smoke text-sm mt-1">
                <i>Last Synced: Blarg</i>
              </div>

              <div className="mt-2">
                <Button
                  className={`w-full text-sm ${
                    isConnected
                      ? "bg-red-500/20 hover:bg-red-500/30 text-red-300"
                      : "bg-green-500/20 hover:bg-green-500/30 text-green-300"
                  }`}
                  onClick={() => handleConnect(s as Service)}
                >
                  {isConnected ? "Disconnect" : "Connect & Sync"}
                </Button>
              </div>
            </Box>
          </div>
        )}

        <Button
          className="bg-amethyst-smoke hover:bg-amethyst-smoke/90 active:bg-lavender-grey/80 m-2"
          onClick={() => setServiceModal(true)}
        >
          Add service
        </Button>
      </Wrapper>

      <ConfigureServiceModal
        serviceModal={serviceModal}
        setServiceModal={setServiceModal}
        onSave={(service) => {
          setConnectionConfig(service);
          setServiceModal(false);
        }}
        onDelete={(id) => {
          // setConnectionConfig(null);
          setServiceModal(false);
        }}
      />
    </>
  );
};

const ConfigureServiceModal = ({
  serviceModal,
  setServiceModal,
  onSave,
  onDelete,
}: {
  serviceModal: Service | boolean;
  setServiceModal: (_: boolean) => void;
  onSave: (service: AddService) => void;
  onDelete?: (id: string) => void;
}) => {
  const newService = typeof serviceModal === "boolean";
  const existingService =
    typeof serviceModal !== "boolean" ? serviceModal : null;

  const title = newService
    ? "Add new service"
    : `Configure ${existingService?.name || existingService?.host}`;

  const [service, setService] = useState<AddService>(
    existingService
      ? {
          host: existingService.host,
          port: existingService.port,
          username: existingService.username,
          password: existingService.password,
          name: existingService.name || "",
          remotePath: existingService.remotePath || "/home/user/org-notes",
        }
      : DEFAULT_SERVICE
  );

  const [showAdvanced, setShowAdvanced] = useState(false);

  const isValid =
    service.host.trim() !== "" &&
    service.username.trim() !== "" &&
    service.port > 0 &&
    service.port <= 65535;

  return (
    <Modal
      title={title}
      description="Configure your SFTP service connection. Only SSH/SFTP connections are supported."
      show={!!serviceModal}
      onClose={() => {
        setServiceModal(false);
      }}
      onSave={() => {
        if (isValid) {
          onSave(service);
        }
      }}
      // saveDisabled={!isValid}
      // footer={
      //   !newService && onDelete && existingService ? (
      //     <Button
      //       className="bg-red-500/20 hover:bg-red-500/30 text-red-300 mr-auto"
      //       onClick={() => onDelete(existingService.id)}
      //     >
      //       Delete Service
      //     </Button>
      //   ) : null
      // }
    >
      <Column>
        <Row>
          <Column className="flex-1">
            <Label>Host</Label>
            <Input
              value={service.host}
              placeholder="example.com"
              onChange={(e) => setService({ ...service, host: e.target.value })}
            />
          </Column>
          <Column>
            <Label>Port</Label>
            <Input
              style={{ width: "60px" }}
              value={service.port}
              type="number"
              min="1"
              max="65535"
              placeholder="22"
              onChange={(e) =>
                setService({
                  ...service,
                  port: parseInt(e.target.value) || 22,
                })
              }
            />
          </Column>
        </Row>

        <Label>Username</Label>
        <Input
          value={service.username}
          placeholder="username"
          onChange={(e) => setService({ ...service, username: e.target.value })}
        />

        <Row>
          <Column className="flex-1">
            <Label>Password</Label>
            <Input
              value={service.password}
              placeholder="*******"
              type="password"
              onChange={(e) =>
                setService({ ...service, password: e.target.value })
              }
            />
          </Column>
          <Label className="flex-1 mt-6 pt-3">or</Label>
          <Column>
            <Label>SSH key</Label>
            <Input
              value={service.host}
              placeholder="****"
              onChange={(e) => setService({ ...service, host: e.target.value })}
            />
          </Column>
        </Row>

        <Label>Name (optional)</Label>
        <Input
          value={service.name || ""}
          placeholder="My Server"
          onChange={(e) => setService({ ...service, name: e.target.value })}
        />

        <Button
          className="text-amethyst-smoke hover:text-white text-sm mt-2"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? "Hide" : "Show"} Advanced Settings
        </Button>

        {showAdvanced && (
          <Column className="mt-2">
            <Label>Remote Path</Label>
            <Input
              value={service.remotePath || ""}
              placeholder="/home/user/org-notes"
              onChange={(e) =>
                setService({ ...service, remotePath: e.target.value })
              }
            />
            <div className="text-xs text-amethyst-smoke mt-1">
              Path to your org notes directory on the remote server
            </div>
          </Column>
        )}
      </Column>
    </Modal>
  );
};

const Row = tw.div`flex flex-row gap-2`;
const Column = tw.div`flex flex-col`;

const Label = tw.label`
  text-amethyst-smoke
  mt-2
  text-sm
`;

const Box = tw.div`
  border-amethyst-smoke
  bg-graphite
  border
  m-2
  rounded-xl
  p-4
  text-center
  content-center
  relative
`;
