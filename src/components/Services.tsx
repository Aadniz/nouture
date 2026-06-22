import { Capacitor } from "@capacitor/core";
import { SubHeader, Wrapper } from "../fragments/Elements";
import { prettyDateTime } from "../utils/date";
import tw from "tailwind-styled-components";
import { Button } from "../fragments/Button";
import { useState } from "react";

interface Service {
  host: string;
  port: number;
  name?: string;
  lastSynced?: Date;
}

export const Services = () => {
  const platform = Capacitor.getPlatform();

  const [serviceModal, setServiceModal] = useState<Service | boolean>();

  const exampleServices: Array<Service> = [
    {
      host: "example.ddns.net",
      port: 6665,
      name: "Backup Server",
      lastSynced: new Date("2026-06-23"),
    },
    {
      host: "aadniz.ddns.net",
      port: 6665,
    },
  ];

  return (
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
  );
};

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
