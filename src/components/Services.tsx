import { Capacitor } from "@capacitor/core";
import { Input, SubHeader, Wrapper } from "../fragments/Elements";
import { prettyDateTime } from "../utils/date";
import tw from "tailwind-styled-components";
import { Button } from "../fragments/Button";
import { useState } from "react";
import { Modal } from "../fragments/Modal";
import { Icon } from "../icons/icon";
import { AddService, Service, useServiceStore } from "../stores/serviceStore";

export const Services = () => {
  const platform = Capacitor.getPlatform();

  // Editing: Service
  // New service: true
  // Hidden: false
  const [serviceModal, setServiceModal] = useState<Service | boolean>(false);
  const { services, addService } = useServiceStore();

  return (
    <>
      <Wrapper className="rounded-lg shadow-lg">
        <SubHeader>Services</SubHeader>
        <div className="grid">
          {services.map((s) => {
            const description = s.name ? `${s.host}:${s.port}` : undefined;
            const name = s.name ?? `${s.host}:${s.port}`;

            return (
              <Box className="relative" key={s.id}>
                <Button
                  className="absolute top-0 right-0 text-white/80 hover:text-white/70 active:text-lavender-grey"
                  onClick={() => {
                    setServiceModal(s);
                  }}
                >
                  <Icon title="gear_wide_connected" />
                </Button>
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
        addService={addService}
      />
    </>
  );
};

const DEFAULT_SERVICE: AddService = {
  host: "",
  port: 22,
};

const ConfigureServiceModal = ({
  serviceModal,
  setServiceModal,
  addService,
}: {
  serviceModal: Service | boolean;
  setServiceModal: (_: boolean) => void;
  addService: (service: AddService) => void;
}) => {
  const newService = typeof serviceModal === "boolean";
  const title = newService
    ? "Add new service"
    : `Configure ${serviceModal.name ?? serviceModal.host}`;

  const [service, setService] = useState<AddService>(
    typeof serviceModal !== "boolean" ? serviceModal : DEFAULT_SERVICE
  );

  return (
    <Modal
      title={title}
      description="Just configure your service by defining the hostname and port number. Only SSH/SFTP are supported for now."
      show={!!serviceModal}
      onClose={() => setServiceModal(false)}
      onSave={() => {
        addService(service);
        setServiceModal(false);
        setService(DEFAULT_SERVICE);
      }}
    >
      <Column>
        <Row>
          <Column>
            <Label>Host</Label>
            <Input
              value={service.host}
              placeholder="example.com"
              onChange={(
                e: React.ChangeEvent<HTMLInputElement, HTMLInputElement>
              ) => setService({ ...service, ...{ host: e.target.value } })}
            />
          </Column>
          <Column>
            <Label>Port</Label>
            <Input
              style={{ width: "80px" }}
              value={service.port}
              type="number"
              min="1"
              max="65535"
              placeholder="22"
              onChange={(
                e: React.ChangeEvent<HTMLInputElement, HTMLInputElement>
              ) =>
                setService({
                  ...service,
                  ...{ port: parseInt(e.target.value) },
                })
              }
            />
          </Column>
        </Row>
        <Label>Name</Label>
        <Input value={service.name} placeholder="(optional)" />
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
