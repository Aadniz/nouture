import { Capacitor } from "@capacitor/core";
import { Input, SubHeader, Wrapper } from "../fragments/Elements";
import { prettyDateTime } from "../utils/date";
import tw from "tailwind-styled-components";
import { Button } from "../fragments/Button";
import { useState } from "react";
import { Modal } from "../fragments/Modal";

interface Service {
  id: string;
  host: string;
  port: number;
  name?: string;
  lastSynced?: Date;
}

export const Services = () => {
  const platform = Capacitor.getPlatform();

  // Editing: Service
  // New service: true
  // Hidden: false
  const [serviceModal, setServiceModal] = useState<Service | boolean>(false);

  const exampleServices: Array<Service> = [
    {
      id: "qwenoqwdnuioqwion",
      host: "example.ddns.net",
      port: 6665,
      name: "Backup Server",
      lastSynced: new Date("2026-06-23"),
    },
    {
      id: "asdnqaengwiwe3",
      host: "aadniz.ddns.net",
      port: 6665,
    },
  ];

  return (
    <>
      <Wrapper className="rounded-lg shadow-lg">
        <SubHeader>Services</SubHeader>
        <div className="grid">
          {exampleServices.map((s) => {
            const description = s.name ? `${s.host}:${s.port}` : undefined;
            const name = s.name ?? `${s.host}:${s.port}`;

            return (
              <Box onClick={() => setServiceModal(s)}>
                <h2>{name}</h2>
                {description && (
                  <div className="text-white/50 text-sm">({description})</div>
                )}
                <i className="text-amethyst-smoke text-sm">
                  Last Synced: {prettyDateTime(s.lastSynced, "short")}
                </i>
              </Box>
            );
          })}
          <Button
            className="bg-amethyst-smoke hover:bg-amethyst-smoke/90 active:bg-lavender-grey/80 m-2"
            onClick={() => {
              setServiceModal(true);
            }}
          >
            Add service
          </Button>
        </div>
      </Wrapper>
      <ConfigureServiceModal
        serviceModal={serviceModal}
        setServiceModal={setServiceModal}
      />
    </>
  );
};

const ConfigureServiceModal = ({
  serviceModal,
  setServiceModal,
}: {
  serviceModal: Service | boolean;
  setServiceModal: (_: boolean) => void;
}) => {
  const newService = typeof serviceModal === "boolean";
  const title = newService
    ? "Add new service"
    : `Configure ${serviceModal.name ?? serviceModal.host}`;

  let id = "";
  let host = "";
  let name = "";
  let port = "";
  if (typeof serviceModal !== "boolean") {
    // Means we are editing a service
    id = serviceModal.id;
    host = serviceModal.host;
    name = serviceModal.name ?? "";
    port = serviceModal.port.toString();
  }

  return (
    <Modal
      title={title}
      description="Just configure your service by defining the hostname and port number. Only SSH/SFTP are supported for now."
      show={!!serviceModal}
      onClose={() => setServiceModal(false)}
    >
      <Column>
        <Row>
          <Column>
            <Label>Host</Label>
            <Input value={host} placeholder="example.com" />
          </Column>
          <Column>
            <Label>Port</Label>
            <Input style={{ width: "80px" }} value={port} placeholder="22" />
          </Column>
        </Row>
        <Label>Name</Label>
        <Input value={name} placeholder="(optional)" />
      </Column>
    </Modal>
  );
};

const Row = tw.div`flex flex-row gap-2`;
const Column = tw.div`flex flex-col`;

const Label = tw.label`
  text-amethyst-smoke
`;

const Box = tw.div`
  border-amethyst-smoke
  bg-graphite
  border
  m-2
  rounded-xl
  p-2
  text-center
  content-center
  text-nowrap
`;
