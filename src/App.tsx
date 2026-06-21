import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { EdgeToEdge } from "@capawesome/capacitor-android-edge-to-edge-support";
import tw from "tailwind-styled-components";
import styled from "styled-components";

import logo from "./assets/Nouture.png";

export const App = () => {
  const [clickCount, setClickCount] = useState(0);

  const platform = Capacitor.getPlatform();

  // Set phone edge colors
  if (platform === "android") {
    const color =
      getComputedStyle(document.documentElement).getPropertyValue(
        "--color-space-indigo",
      ) || "#000000";
    EdgeToEdge.setNavigationBarColor({
      color: color,
    });
    EdgeToEdge.setStatusBarColor({
      color: color,
    });
  }

  return (
    <div className="min-h-screen bg-shadow-grey text-white">
      {/* Header */}
      <LogoWrapper className="safe-area-top shadow-lg">
        <div className="container mx-auto text-center">
          <Header>Nouture</Header>
          <i className="text-amethyst-smoke">Your note-taking syncer</i>
        </div>
      </LogoWrapper>

      {/* Main Content */}
      <main className="container mx-auto py-8">
        {/* Interactive Card */}
        <Wrapper className="rounded-lg p-6 mb-6 shadow-lg">
          <h2 className="text-lg font-semibold mb-4">Recent opened notes</h2>
          <button
            onClick={() => setClickCount((prev) => prev + 1)}
            className="w-full bg-lavender-grey hover:bg-periwinkle text-white font-bold py-3 px-6 rounded-lg transition duration-200 active:scale-95 transform"
          >
            Some reactive button ({clickCount})
          </button>
        </Wrapper>

        {/* Platform Info */}
        <Wrapper className="rounded-lg shadow-lg">
          <h2 className="text-lg font-semibold mb-2">Add services</h2>
          <p className="text-amethyst-smoke">
            Running on: {platform[0].toUpperCase() + platform.substring(1)}
          </p>
        </Wrapper>
      </main>

      {/* Footer */}
      <Footer>
        <p className="text-center text-amethyst-smoke text-sm">
          Made by the ultimate meowmeow team
        </p>
      </Footer>
    </div>
  );
};

const Wrapper = tw.div`
  bg-space-indigo
  p-4
`;

const LogoWrapper = styled(Wrapper)`
  background-image: url("${logo}");
  background-size: contain;
  background-position: left;
  background-repeat: no-repeat;
`;

const Footer = tw(Wrapper)`
  p-4
  sticky
  top-full
`;

const Header = tw.h2`
  text-8xl
  text-desert-sand
  text-center
`;

export default App;
