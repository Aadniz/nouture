import { describe, expect, it } from "vitest";
import {
  checkValue,
  formatRoot,
  parseProfile,
  parsePattern,
  parseRoot,
  resolveRootRef,
  serializeProfile,
  setValue,
  setValues,
  validateProfile,
  valueOf,
  valuesOf,
} from "./profile";
import { ALL_PREFS, ANDROID, OFFERED, PREFS, ROOT_PREFS, SECTIONS, isProfilePref } from "./schema";

const DESKTOP = `root = /home/me/Documents/org
root = ssh://backup//srv/unison/org
batch = true

# Set SSH port and key
#sshargs = -p 2222
`;

const ANDROID_PROFILE = `root = /storage/emulated/0/Documents/org
root = ssh://backup//srv/unison/org
batch = true
fat = true
`;

const errors = (text: string) =>
  validateProfile(parseProfile(text)).filter((i) => i.severity === "error");

describe("schema", () => {
  it("knows unison's preferences", () => {
    expect(PREFS.batch).toMatchObject({ kind: "bool", default: false, category: ["Basic", "Syncprocess"] });
    expect(PREFS.perms).toMatchObject({ kind: "int", default: 0o1777 });
    expect(PREFS.ignore.kind).toBe("pattern");
    expect(PREFS.ui.cliOnly).toBe(true);
  });

  it("offers every option that works on Android, once", () => {
    const NOT_OFFERED = ["unsupported", "incompatible", "hidden", "managed"];
    const offered = [...ROOT_PREFS, ...SECTIONS.flatMap((s) => s.prefs)];
    expect(new Set(offered).size).toBe(offered.length);
    for (const name of offered) {
      expect(PREFS[name], name).toBeDefined();
      expect(isProfilePref(PREFS[name]), name).toBe(true);
      expect(NOT_OFFERED, name).not.toContain(ANDROID[name]?.level);
    }
    const missing = ALL_PREFS.filter(
      (p) =>
        isProfilePref(p) &&
        !p.deprecated &&
        !["Expert", "Internal"].includes(p.category[0]) &&
        p.name !== "root" &&
        !NOT_OFFERED.includes(ANDROID[p.name]?.level ?? "") &&
        !offered.includes(p.name)
    );
    expect(missing.map((p) => p.name)).toEqual([]);
  });

  it("leaves out what's incompatible between Linux and Android", () => {
    for (const name of ["owner", "group", "perms", "links", "ignorecase", "xattrs", "merge", "sshcmd", "repeat", "ui"]) {
      expect(OFFERED.has(name), name).toBe(false);
    }
    expect(SECTIONS[0].prefs[0]).toBe("ignore");
  });
});

describe("parseProfile", () => {
  it("round-trips byte-for-byte", () => {
    for (const text of [DESKTOP, DESKTOP.replace(/\n/g, "\r\n"), "root = a", "", "﻿batch = true\n"]) {
      expect(serializeProfile(parseProfile(text))).toBe(text);
    }
  });

  it("reads lines like unison", () => {
    const { lines } = parseProfile("include common\n  include indented = x\ninclude? a b\n# c\nnonsense\n");
    expect(lines.map((l) => l.kind)).toEqual(["directive", "pref", "directive", "comment", "garbled"]);
    expect(lines[2]).toMatchObject({ directive: "include?", file: null });
  });
});

describe("setValues", () => {
  it("keeps comments and only touches changed lines", () => {
    const profile = parseProfile(DESKTOP);
    const out = serializeProfile(setValue(profile, "batch", "false"));
    expect(out).toBe(DESKTOP.replace("batch = true", "batch = false"));
  });

  it("appends new preferences before trailing blank lines", () => {
    const out = serializeProfile(setValue(parseProfile("root = a\nroot = b\n\n"), "fat", "true"));
    expect(out).toBe("root = a\nroot = b\nfat = true\n\n");
  });

  it("adds list values after the existing ones and removes leftovers", () => {
    const profile = parseProfile("ignore = Name *.tmp\nbatch = true\nignore = Name *~\n");
    const added = setValues(profile, "ignore", ["Name *.tmp", "Name *~", "Path .git"]);
    expect(serializeProfile(added)).toBe("ignore = Name *.tmp\nbatch = true\nignore = Name *~\nignore = Path .git\n");
    const removed = setValues(profile, "ignore", ["Name *~"]);
    expect(serializeProfile(removed)).toBe("ignore = Name *~\nbatch = true\n");
  });

  it("adds a terminator to a last line without one", () => {
    expect(serializeProfile(setValue(parseProfile("root = a"), "fat", "true"))).toBe("root = a\nfat = true\n");
  });

  it("treats aliases as their preference", () => {
    const profile = parseProfile("mirror = Name *\nbackupversions = 3\n");
    expect(valuesOf(profile, "backup")).toEqual(["Name *"]);
    expect(valueOf(profile, "maxbackups")).toBe("3");
    expect(serializeProfile(setValue(profile, "maxbackups", "4"))).toBe("mirror = Name *\nbackupversions = 4\n");
  });
});

describe("roots", () => {
  it("parses like clroot.ml", () => {
    expect(parseRoot("ssh://backup//srv/unison")).toEqual({
      protocol: "ssh", host: "backup", path: "/srv/unison", user: undefined, port: undefined,
    });
    expect(parseRoot("ssh://me@example.com:2222/org")).toMatchObject({ user: "me", port: "2222", path: "org" });
    expect(parseRoot("/storage/emulated/0/org")).toEqual({ protocol: "file", path: "/storage/emulated/0/org" });
    expect(() => parseRoot("rsh://host/x")).toThrow(/deprecated/);
    expect(() => parseRoot("ssh:/host")).toThrow(/must be followed by/);
    expect(() => parseRoot("ssh:///path")).toThrow(/missing host/);
    expect(() => parseRoot("socket://host/x")).toThrow(/port number/);
  });

  it("formats back to the same string", () => {
    for (const root of ["ssh://backup//srv/unison", "ssh://me@host:22/org", "/storage/emulated/0/org"]) {
      expect(formatRoot(parseRoot(root))).toBe(root);
    }
  });

  it("resolves prefer values like recon.ml", () => {
    const roots = ["/storage/emulated/0/Documents/org", "ssh://backup//srv/unison/org"];
    expect(resolveRootRef("ssh://backup//srv/unison/org", roots)).toBe(1);
    expect(resolveRootRef("/storage", roots)).toBe(0);
    expect(resolveRootRef("backup", roots)).toBe(1);
    expect(resolveRootRef("org", roots)).toBe(null); // suffix of both
  });
});

describe("validateProfile", () => {
  it("accepts the Android profile", () => {
    expect(validateProfile(parseProfile(ANDROID_PROFILE))).toEqual([]);
  });

  it("explains what Nouture needs from roots and storage", () => {
    expect(errors(DESKTOP.replace("/home/me", "home/me"))[0].message).toMatch(/absolute path/);
    const warnings = validateProfile(parseProfile(ANDROID_PROFILE.replace("fat = true\n", "")));
    expect(warnings).toEqual([expect.objectContaining({ severity: "warning", pref: "fat" })]);
    expect(errors("root = /storage/a\n")[0].message).toMatch(/exactly two roots/);
  });

  it("rejects what unison rejects", () => {
    expect(errors(ANDROID_PROFILE + "batch = yes\n")[0].message).toBe("batch expects a boolean value, but yes is not a boolean");
    expect(errors(ANDROID_PROFILE + "perms = 0o1777\n")).toEqual([]);
    expect(errors(ANDROID_PROFILE + "perms = 777o\n")[0].message).toMatch(/not an integer/);
    expect(errors(ANDROID_PROFILE + "frobnicate = 1\n")[0].message).toBe("`frobnicate' is not a valid option");
    expect(errors(ANDROID_PROFILE + "ui = text\n")[0].message).toMatch(/command line-only/);
    expect(errors(ANDROID_PROFILE + "ignore = *.tmp\n")[0].message).toMatch(/Name, Path, BelowPath or Regex/);
    expect(errors(ANDROID_PROFILE + "ignore = Path /abs\n")[0].message).toMatch(/may not begin with a slash/);
    expect(errors(ANDROID_PROFILE + "path = ../up\n")[0].message).toMatch(/'\.\.' not allowed/);
    expect(errors(ANDROID_PROFILE + "backuploc = elsewhere\n")[0].message).toMatch(/'local' or 'central'/);
    expect(errors(ANDROID_PROFILE + "include common\n")).toEqual([]);
    expect(errors(ANDROID_PROFILE + "include a b\n")[0].message).toMatch(/Garbled 'include'/);
  });

  it("warns about Linux-only settings copied from a desktop profile", () => {
    const warned = (line: string) =>
      validateProfile(parseProfile(ANDROID_PROFILE + line + "\n"))
        .filter((i) => i.severity === "warning")
        .map((i) => i.pref);
    expect(warned("perms = 0o1777")).toEqual(["perms"]);
    expect(warned("perms = 0")).toEqual([]);
    expect(warned("owner = true")).toEqual(["owner"]);
    expect(warned("owner = false")).toEqual([]);
    expect(warned("ignorecase = false")).toEqual(["ignorecase"]);
    expect(warned("links = true")).toEqual(["links"]);
    expect(warned("merge = Name *.org -> diff3 CURRENT1 CURRENTARCH CURRENT2")).toEqual(["merge"]);
  });

  it("rejects what can't work on Android", () => {
    expect(errors(ANDROID_PROFILE + "sshcmd = /usr/bin/ssh\n")[0].message).toMatch(/own SSH layer/);
    expect(errors(ANDROID_PROFILE + "repeat = watch\n")[0].message).toMatch(/once per sync/);
    const socket = ANDROID_PROFILE.replace("ssh://backup//", "socket://backup:4000/");
    expect(errors(socket)[0].message).toMatch(/socket/);
  });

  it("checks root references", () => {
    expect(errors(ANDROID_PROFILE + "prefer = newer\n")).toEqual([]);
    expect(errors(ANDROID_PROFILE + "prefer = backup\n")).toEqual([]);
    expect(errors(ANDROID_PROFILE + "prefer = elsewhere\n")[0].message).toMatch(/not uniquely identifying/);
    expect(errors(ANDROID_PROFILE + "nocreation = newer\n")[0].message).toMatch(/not uniquely identifying/);
  });

  it("checks pattern values", () => {
    expect(parsePattern("Name *.org -> newer")).toEqual({ kind: "Name", body: "*.org", value: "newer" });
    expect(checkValue("preferpartial", "Name *.org -> newer", [])).toBe(null);
    expect(checkValue("preferpartial", "Name *.org", [])).toMatchObject({ severity: "warning" });
    expect(checkValue("ignore", "Name {a,b", [])?.message).toMatch(/Malformed/);
  });

  it("warns about values unison accepts but silently ignores", () => {
    expect(checkValue("fastcheck", "maybe", [])).toMatchObject({ severity: "warning" });
    expect(checkValue("fastcheck", "default", [])).toBe(null);
  });

  it("checks that included profiles exist", () => {
    const profile = parseProfile(ANDROID_PROFILE + "include common\ninclude? optional\n");
    expect(validateProfile(profile, ["common"])).toEqual([]);
    expect(validateProfile(profile, ["other"])[0].message).toMatch(/common not found/);
  });
});

describe("sshargs and the server root", () => {
  const warnings = (text: string) =>
    validateProfile(parseProfile(text)).filter((i) => i.pref === "sshargs").map((i) => i.message);

  it("warns when sshargs repeats the root's port or user", () => {
    const withPort = ANDROID_PROFILE.replace("ssh://backup//", "ssh://me@backup:2222//");
    expect(warnings(withPort + "sshargs = -p 2222 -l other\n")).toEqual([
      "The server root already sets port 2222; ssh uses that one, so -p here is ignored.",
      "The server root already sets user me; ssh uses that one, so -l here is ignored.",
    ]);
    expect(warnings(withPort + "sshargs = -Cp2222\n")).toHaveLength(1);
  });

  it("is fine when only sshargs sets them, like a desktop profile", () => {
    expect(warnings(ANDROID_PROFILE + "sshargs = -p 2222\n")).toEqual([]);
    expect(warnings(ANDROID_PROFILE + "sshargs = -i ~/.ssh/android -o Compression=yes\n")).toEqual([]);
  });
});
