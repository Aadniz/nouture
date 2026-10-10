import { describe, expect, it } from "vitest";
import { resolveSshHost, sshHosts } from "./sshConfig";

const CONFIG = `# personal
Host backup
  Port 2222
  User me
  HostName example.com

Host *.lan !printer.lan
  User pi

Host *
  User fallback
  Port=2200
`;

describe("resolveSshHost", () => {
  it("takes the first value, like OpenSSH", () => {
    expect(resolveSshHost(CONFIG, "backup")).toEqual({ port: "2222", user: "me", hostName: "example.com" });
  });

  it("matches wildcards and negations", () => {
    expect(resolveSshHost(CONFIG, "nas.lan")).toEqual({ user: "pi", port: "2200" });
    expect(resolveSshHost(CONFIG, "printer.lan")).toEqual({ user: "fallback", port: "2200" });
  });

  it("is empty without a config", () => {
    expect(resolveSshHost("", "backup")).toEqual({});
  });

  it("lists plain host aliases for suggestions", () => {
    expect(sshHosts(CONFIG)).toEqual(["backup"]);
  });
});
