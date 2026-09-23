import { registerPlugin } from "@capacitor/core";
import type { SFTPPlugin } from "./definitions";

const SFTP = registerPlugin<SFTPPlugin>("SFTP", {
  web: () => import("./web").then((m) => new m.SFTPWeb()),
});

export * from "./definitions";
export { SFTP };
