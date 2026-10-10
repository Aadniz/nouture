import { useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { EdgeToEdge } from "@capawesome/capacitor-android-edge-to-edge-support";
import { RouterProvider, createHashRouter } from "react-router-dom";
import tw from "tailwind-styled-components";

import { Home } from "./components/Home";
import { ConflictRoute } from "./components/ConflictPage";
import { NoteBrowser } from "./components/NoteBrowser";
import { NoteRoute } from "./components/NotePage";
import { ProfileRoute } from "./components/ProfilePage";
import { useUnisonStore } from "./stores/unisonStore";

// A data router, so pages can ask before leaving with unsaved changes
const router = createHashRouter([
  { path: "/", element: <Home /> },
  { path: "/notes", element: <NoteBrowser /> },
  { path: "/note", element: <NoteRoute /> },
  { path: "/profile", element: <ProfileRoute /> },
  { path: "/conflict", element: <ConflictRoute /> },
]);

export const App = () => {
  const platform = Capacitor.getPlatform();

  // Set Android edge colors
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

  useEffect(() => {
    useUnisonStore.getState().refresh();

    // Android's back button walks back through the pages before leaving
    const listener = CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else CapacitorApp.exitApp();
    });
    return () => {
      listener.then((l) => l.remove());
    };
  }, []);

  return (
    <AppWrapper>
      <RouterProvider router={router} />
    </AppWrapper>
  );
};

const AppWrapper = tw.div`
  min-h-screen
  bg-shadow-grey
  text-white
  relative
`;

export default App;
