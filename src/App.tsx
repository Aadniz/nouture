import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { EdgeToEdge } from "@capawesome/capacitor-android-edge-to-edge-support";
import tw from "tailwind-styled-components";

import { Services } from "./components/Services";
import { Footer, LogoWrapper, SubHeader, Wrapper } from "./fragments/Elements";
import { Button } from "./fragments/Button";

export const App = () => {
  const [clickCount, setClickCount] = useState(0);

  const platform = Capacitor.getPlatform();

  // Set phone edge colors
  if (platform === "android") {
    const color =
      getComputedStyle(document.documentElement).getPropertyValue(
        "--color-space-indigo"
      ) || "#000000";
    EdgeToEdge.setNavigationBarColor({
      color: color,
    });
    EdgeToEdge.setStatusBarColor({
      color: color,
    });
  }

  return (
    <AppWrapper>
      <LogoWrapper className="safe-area-top shadow-lg">
        <div className="container mx-auto text-center">
          <Header>Nouture</Header>
          <i className="text-amethyst-smoke">Your note-taking syncer</i>
        </div>
      </LogoWrapper>

      <main className="container mx-auto py-8">
        <Wrapper className="rounded-lg mb-6 shadow-lg">
          <SubHeader>Recent opened notes</SubHeader>
          <Button
            onClick={() => setClickCount((prev) => prev + 1)}
            className="bg-amethyst-smoke hover:bg-amethyst-smoke/90 active:bg-lavender-grey/80 w-full"
          >
            Some reactive button ({clickCount})
          </Button>
        </Wrapper>

        <Services />
      </main>

      <Footer>
        <p className="text-center text-amethyst-smoke text-sm">
          Made by the ultimate meowmeow team
        </p>
      </Footer>
    </AppWrapper>
  );
};

const AppWrapper = tw.div`
  min-h-screen
  bg-shadow-grey
  text-white
  relative
`;

const Header = tw.h2`
  text-8xl
  text-desert-sand
  text-center
`;

export default App;
