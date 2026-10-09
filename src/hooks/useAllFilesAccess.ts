import { App } from "@capacitor/app";
import { useEffect, useState } from "react";
import { Notes } from "../plugins/notes";

/** Whether Nouture may read the shared org folders; re-checked when returning from Settings. */
export const useAllFilesAccess = () => {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () =>
      Notes.hasAllFilesAccess().then(({ granted }) => setGranted(granted));
    check();
    const listener = App.addListener("resume", check);
    return () => {
      listener.then((l) => l.remove());
    };
  }, []);

  return { granted, request: () => Notes.requestAllFilesAccess() };
};
