import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { EdgeToEdge } from "@capawesome/capacitor-android-edge-to-edge-support";
import tw from "tailwind-styled-components";

import { Services } from "./components/Services";
import { Footer, LogoWrapper, Wrapper } from "./fragments/Elements";

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
        <Wrapper className="rounded-lg p-6 mb-6 shadow-lg">
          <h2 className="text-lg font-semibold mb-4">Recent opened notes</h2>
          <button
            onClick={() => setClickCount((prev) => prev + 1)}
            className="w-full bg-lavender-grey hover:bg-periwinkle text-white font-bold py-3 px-6 rounded-lg transition duration-200 active:scale-95 transform"
          >
            Some reactive button ({clickCount})
          </button>
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
