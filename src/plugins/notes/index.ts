import { registerPlugin } from "@capacitor/core";
import type { NotesPlugin } from "./definitions";

const Notes = registerPlugin<NotesPlugin>("Notes", {
  web: () => import("./web").then((m) => new m.NotesWeb()),
});

export * from "./definitions";
export { Notes };
