import { registerPlugin } from "@capacitor/core";
import type { UnisonPlugin } from "./definitions";

const Unison = registerPlugin<UnisonPlugin>("Unison", {
  web: () => import("./web").then((m) => new m.UnisonWeb()),
});

export * from "./definitions";
export { Unison };
