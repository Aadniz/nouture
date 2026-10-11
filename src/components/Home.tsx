import tw from "tailwind-styled-components";
import { Footer, LogoWrapper } from "../fragments/Elements";
import { Profiles } from "./Profiles";
import { RecentNotes } from "./RecentNotes";
import { SshSettings } from "./SshSettings";

export const Home = () => (
  <>
    <LogoWrapper className="safe-area-top shadow-lg">
      <div className="container mx-auto text-center">
        <Header>Nouture</Header>
        <i className="text-amethyst-smoke">
          Bring org documents with you everywhere
        </i>
      </div>
    </LogoWrapper>

    <main className="container mx-auto py-8">
      <RecentNotes />
      <Profiles />
      <SshSettings />
    </main>

    <Footer>
      <p className="text-center text-amethyst-smoke text-sm">
        Made by the ultimate meowmeow team
      </p>
    </Footer>
  </>
);

const Header = tw.h2`
  text-8xl
  text-desert-sand
  text-center
`;
