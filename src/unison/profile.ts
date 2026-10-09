import {
  ALIASES,
  ANDROID,
  PATTERN_KINDS,
  PATTERN_VALUES,
  PREFS,
  REMOVED,
  VALUE_RULES,
  ValueRule,
  canonical,
  isList,
  warnsOnAndroid,
} from "./schema";

/**
 * Unison profiles (~/.unison/*.prf), parsed the way unison's prefs.ml reads
 * them. Edits rewrite only the lines they touch, so comments, includes and
 * formatting written on a computer survive.
 */

export type Line =
  | { kind: "blank" | "comment"; raw: string }
  | { kind: "directive"; raw: string; directive: string; file: string | null }
  | { kind: "pref"; raw: string; name: string; value: string }
  | { kind: "garbled"; raw: string };

export interface Profile {
  lines: Line[];
  /** The terminator after each line ("" for a last line without one) */
  eols: string[];
}

export interface Issue {
  severity: "error" | "warning";
  message: string;
  /** 0-based line, when the issue belongs to one */
  line?: number;
  /** Canonical preference name, when the issue belongs to one */
  pref?: string;
}

const DIRECTIVES = ["include? ", "source? ", "include ", "source "];
const BOM = "﻿";

export const parseProfile = (text: string): Profile => {
  const lines: Line[] = [];
  const eols: string[] = [];
  for (const match of text.matchAll(/([^\n]*)(\n|$)/g)) {
    if (match[0] === "" && match.index === text.length) break;
    lines.push(parseLine(match[1], lines.length === 0));
    eols.push(match[2]);
  }
  return { lines, eols };
};

export const serializeProfile = ({ lines, eols }: Profile) =>
  lines.map((line, i) => line.raw + eols[i]).join("");

const parseLine = (raw: string, first: boolean): Line => {
  let line = raw.replace(/\r$/, "");
  if (first && line.startsWith(BOM)) line = line.slice(1);
  const trimmed = line.trim();

  if (trimmed === "") return { kind: "blank", raw };
  if (trimmed.startsWith("#")) return { kind: "comment", raw };

  // Like unison, directives must start the line (no leading whitespace)
  const directive = DIRECTIVES.find((d) => line.startsWith(d));
  if (directive) {
    const words = line.split(" ").filter(Boolean);
    return {
      kind: "directive",
      raw,
      directive: directive.trim(),
      file: words.length === 2 ? words[1] : null,
    };
  }

  const eq = line.indexOf("=");
  if (eq < 0) return { kind: "garbled", raw };
  return {
    kind: "pref",
    raw,
    name: line.slice(0, eq).trim(),
    value: line.slice(eq + 1).trim(),
  };
};

// ---------------------------------------------------------------------------
// Values: what the form edits

/** All values of a preference (or its aliases), in file order. */
export const valuesOf = (profile: Profile, name: string): string[] =>
  profile.lines.flatMap((l) =>
    l.kind === "pref" && canonical(l.name) === name ? [l.value] : []
  );

/** The effective value of a single-valued preference: the last one wins. */
export const valueOf = (profile: Profile, name: string): string | undefined =>
  valuesOf(profile, name).at(-1);

/**
 * Sets a preference's values, rewriting its existing lines in place, removing
 * leftovers and appending new lines after the last one (or at the end).
 */
export const setValues = (profile: Profile, name: string, values: string[]): Profile => {
  const lines = [...profile.lines];
  const eols = [...profile.eols];
  const existing = lines.flatMap((l, i) =>
    l.kind === "pref" && canonical(l.name) === name ? [i] : []
  );

  existing.forEach((index, n) => {
    const line = lines[index] as Extract<Line, { kind: "pref" }>;
    if (n < values.length && line.value !== values[n]) {
      lines[index] = prefLine(line.name, values[n]);
    }
  });

  const extra = values.slice(existing.length).map((v) => prefLine(name, v));
  let insertAt = existing.length ? existing[existing.length - 1] + 1 : lines.length;
  if (!existing.length) {
    // Keep trailing blank lines/comments at the end
    while (insertAt > 0 && lines[insertAt - 1].kind === "blank") insertAt--;
  }
  if (extra.length) {
    // The line before the insertion point needs a terminator
    if (insertAt > 0 && eols[insertAt - 1] === "") eols[insertAt - 1] = "\n";
    lines.splice(insertAt, 0, ...extra);
    eols.splice(insertAt, 0, ...extra.map(() => "\n"));
  }

  // Remove lines beyond the new values (from the end, to keep indices valid)
  for (const index of existing.slice(values.length).reverse()) {
    lines.splice(index, 1);
    eols.splice(index, 1);
  }
  return { lines, eols };
};

/** Sets a single-valued preference, or removes it with undefined. */
export const setValue = (profile: Profile, name: string, value: string | undefined) =>
  setValues(profile, name, value === undefined ? [] : [value]);

const prefLine = (name: string, value: string): Line => ({
  kind: "pref",
  raw: `${name} = ${value}`,
  name,
  value,
});

// ---------------------------------------------------------------------------
// Roots (clroot.ml)

export interface Root {
  protocol: "file" | "ssh" | "socket";
  user?: string;
  host?: string;
  port?: string;
  /** Path on the host; for ssh, a leading "/" means absolute ("//" in the URI) */
  path?: string;
}

/** Parses a root like unison's Clroot.parseRoot; throws its error messages. */
export const parseRoot = (input: string): Root => {
  const s = input.trim();
  const fail = (why: string): never => {
    throw new Error(`"${input}": ${why}`);
  };

  let protocol: Root["protocol"];
  let rest: string;
  const withSlashes = /^([a-zA-Z]+):\/\//.exec(s);
  if (withSlashes) {
    const name = withSlashes[1];
    if (name === "rsh") fail("protocol rsh has been deprecated, use ssh instead");
    if (name === "unison") fail("protocol unison has been deprecated, use file, ssh, or socket instead");
    if (!["file", "ssh", "socket"].includes(name)) fail(`unrecognized protocol ${name}`);
    protocol = name as Root["protocol"];
    rest = s.slice(withSlashes[0].length);
  } else if (s.startsWith("//")) {
    protocol = "file";
    rest = s.slice(2);
  } else {
    const colon = /^([a-zA-Z]+):/.exec(s);
    if (colon && ["file", "ssh", "socket"].includes(colon[1])) {
      fail(`ill-formed root specification (${colon[0]} must be followed by //)`);
    }
    return { protocol: "file", path: s };
  }

  const user = /^[-_a-zA-Z0-9.%@]+@/.exec(rest)?.[0];
  if (user) rest = rest.slice(user.length);
  const host = /^([-_a-zA-Z0-9%.]+|\{[^}]+\}|\[([a-f0-9:.]+(%[-_a-zA-Z0-9~%.]+)?)\])/.exec(rest);
  if (host) rest = rest.slice(host[0].length);
  const port = /^:[^/]+/.exec(rest)?.[0];
  if (port) rest = rest.slice(port.length);
  if (rest && !rest.startsWith("/")) fail("ill-formed root specification");

  const root: Root = {
    protocol,
    user: user?.slice(0, -1),
    host: host ? host[2] ?? host[1] : undefined,
    port: port?.slice(1),
    path: rest.length > 1 ? rest.slice(1) : undefined,
  };

  if (!root.host && (root.port || root.user)) fail("missing host");
  if (!root.host && protocol !== "file") fail("missing host");
  if (protocol === "file" && root.port) fail("ill-formed (cannot use a port number with file)");
  if (protocol === "socket" && root.user) fail("ill-formed (cannot use a user with socket)");
  if (protocol === "socket" && !root.host!.startsWith("{") && !root.port) {
    fail("ill-formed (must give a port number with socket)");
  }
  if (protocol === "socket" && root.host!.startsWith("{") && root.port) {
    fail("ill-formed (must not give a port number with Unix domain socket)");
  }
  return root;
};

export const formatRoot = (root: Root): string => {
  if (root.protocol === "file" && !root.host) return root.path ?? "";
  const auth = `${root.user ? root.user + "@" : ""}${root.host ?? ""}${root.port ? ":" + root.port : ""}`;
  return `${root.protocol}://${auth}/${root.path ?? ""}`;
};

/**
 * Which root a value like "newer", "backup" or "/storage/emulated/0/org"
 * refers to, following recon.ml's root2direction: an exact root, or a
 * unique prefix/suffix of a root's path or prefix of its host.
 */
export const resolveRootRef = (value: string, roots: string[]): number | null => {
  const exact = roots.indexOf(value);
  if (exact >= 0) return exact;
  const matches = roots.map((raw) => {
    let root: Root;
    try {
      root = parseRoot(raw);
    } catch {
      return false;
    }
    const path = root.host && root.protocol === "file" ? `//${root.host}/${root.path ?? ""}` : root.path;
    return (
      (!!path && (path.startsWith(value) || path.endsWith(value))) ||
      (root.protocol !== "file" && !!root.host && root.host.startsWith(value))
    );
  });
  return matches.filter(Boolean).length === 1 ? matches.indexOf(true) : null;
};

// ---------------------------------------------------------------------------
// Patterns (pred.ml)

export interface Pattern {
  kind: (typeof PATTERN_KINDS)[number] | null;
  body: string;
  /** The "-> value" part, for preferences that associate values */
  value?: string;
}

export const parsePattern = (input: string): Pattern => {
  const sep = " -> ";
  const spaced = ` ${input} `;
  const at = spaced.lastIndexOf(sep);
  const pattern = (at >= 0 ? spaced.slice(0, at) : spaced).slice(1);
  const value = at >= 0 ? spaced.slice(at + sep.length).trim() : undefined;
  // Lenient for editing: a bare "Name" (empty body) still has its kind
  const kind = PATTERN_KINDS.find((k) => pattern === k || pattern.startsWith(k + " ")) ?? null;
  return { kind, body: kind ? pattern.slice(kind.length + 1).trim() : pattern.trim(), value };
};

export const formatPattern = (p: Pattern) =>
  `${p.kind ?? ""} ${p.body}${p.value !== undefined ? ` -> ${p.value}` : ""}`.trim();

const checkPattern = (input: string): string | null => {
  const { kind, body } = parsePattern(input);
  if (!input.trim() || (!body && !kind)) return "Empty pattern";
  if (kind && !body) return "Empty pattern";
  if (!kind) {
    return `bad pattern: ${input.trim()}. A pattern must be introduced by one of the following keywords: Name, Path, BelowPath or Regex.`;
  }
  if ((kind === "Path" || kind === "BelowPath") && body.startsWith("/")) {
    return `Malformed pattern: "${input}". '${kind}' patterns may not begin with a slash; only relative paths are allowed.`;
  }
  if (kind === "Regex") {
    try {
      new RegExp(body);
    } catch {
      return `Malformed pattern "${input}".`;
    }
  } else if (!balanced(body)) {
    return `Malformed pattern "${input}".`;
  }
  return null;
};

/** Brackets and braces in globs must be closed */
const balanced = (glob: string) => {
  let bracket = false;
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "\\") i++;
    else if (bracket) bracket = c !== "]";
    else if (c === "[") bracket = true;
    else if (c === "{") braces++;
    else if (c === "}" && --braces < 0) return false;
  }
  return !bracket && braces === 0;
};

// ---------------------------------------------------------------------------
// Validation

const OCAML_INT = /^[-+]?(?:0[xX][0-9a-fA-F][0-9a-fA-F_]*|0[oO][0-7][0-7_]*|0[bB][01][01_]*|[0-9][0-9_]*)$/;
const SHARED_STORAGE = /^\/(storage|sdcard)\//;

/**
 * Validates a profile like unison would load it (checked against unison's
 * own parser), plus what Nouture needs on the phone. `profiles` lists the
 * existing profile names, to check includes.
 */
export const validateProfile = (profile: Profile, profiles?: string[]): Issue[] => {
  const issues: Issue[] = [];
  const roots = valuesOf(profile, "root");
  const seen = new Map<string, number>();

  profile.lines.forEach((line, index) => {
    const at = { line: index };
    if (line.kind === "garbled") {
      issues.push({ ...at, severity: "error", message: `Garbled line (no '='): ${line.raw.trim()}` });
      return;
    }
    if (line.kind === "directive") {
      if (line.file === null) {
        issues.push({ ...at, severity: "error", message: `Garbled '${line.directive}' directive: ${line.raw.trim()}` });
      } else if (line.directive === "include" && profiles && !profiles.includes(line.file.replace(/\.prf$/, ""))) {
        issues.push({ ...at, severity: "error", message: `Profile ${line.file} not found (include)` });
      }
      return;
    }
    if (line.kind !== "pref") return;

    const name = canonical(line.name);
    const spec = PREFS[name];
    const add = (severity: Issue["severity"], message: string) =>
      issues.push({ ...at, pref: name, severity, message });

    if (REMOVED.has(line.name)) return add("error", `\`${line.name}' was removed from unison`);
    if (!spec || spec.category.join(" ") === "Internal Pseudo") {
      return add("error", `\`${line.name}' is not a valid option`);
    }
    if (spec.cliOnly) {
      return add("error", `"${line.name}" is a command line-only option; it must not be present in a profile.`);
    }

    const problem = checkValue(name, line.value, roots);
    if (problem) add(problem.severity, problem.message);

    const support = ANDROID[name];
    if (support?.level === "unsupported") add("error", support.note);
    else if (warnsOnAndroid(name, line.value)) add("warning", support!.note);
    if (spec.deprecated) add("warning", `${name} is deprecated in unison.`);

    if (!isList(spec)) {
      if (seen.has(name)) add("warning", `${name} is set more than once; the last value wins.`);
      seen.set(name, index);
    }
  });

  const hasIncludes = profile.lines.some((l) => l.kind === "directive");
  if (roots.length !== 2) {
    issues.push({
      pref: "root",
      severity: hasIncludes ? "warning" : "error",
      message: `A profile needs exactly two roots (found ${roots.length}).`,
    });
  } else {
    issues.push(...checkNoutureRoots(roots));
    const local = roots.find((r) => SHARED_STORAGE.test(r));
    const fat = ["true"].includes(valueOf(profile, "fat") ?? "");
    const perms = valueOf(profile, "perms");
    if (local && !fat && (perms === undefined || Number(perms) !== 0)) {
      issues.push({
        pref: "fat",
        severity: "warning",
        message: "Android's shared storage is case-insensitive and has no Unix permissions: set fat = true.",
      });
    }
  }
  return issues;
};

type Problem = Pick<Issue, "severity" | "message"> | null;

const error = (message: string | null): Problem =>
  message === null ? null : { severity: "error", message };
const warning = (message: string): Problem => ({ severity: "warning", message });

/**
 * Checks one value of a preference. Errors are what unison rejects when
 * loading the profile, or fails on later (e.g. backuploc, repeat); warnings
 * are values unison accepts but that can't do what was meant.
 */
export const checkValue = (name: string, value: string, roots: string[]): Problem => {
  const spec = PREFS[name];
  if (!spec) return null;
  const rule: ValueRule | undefined = VALUE_RULES[name];

  switch (spec.kind) {
    case "bool":
      return value === "true" || value === "false"
        ? null
        : error(`${name} expects a boolean value, but ${value} is not a boolean`);
    case "int":
      return OCAML_INT.test(value) ? null : error(`${name} expects an integer value, but ${value} is not an integer`);
    case "boolDefault":
      return ["true", "yes", "false", "no", "default", "auto"].includes(value)
        ? null
        : warning(`${name} expects true, false or default; unison treats "${value}" as false`);
    case "pattern": {
      const problem = error(checkPattern(value));
      if (problem) return problem;
      const valueRule = PATTERN_VALUES[name];
      const associated = parsePattern(value).value;
      if (valueRule && associated === undefined) {
        return warning(`Without "-> value" this ${name} pattern has no effect`);
      }
      return valueRule && associated !== undefined ? error(checkRule(valueRule, associated, roots)) : null;
    }
  }
  return rule ? error(checkRule(rule, value, roots)) : null;
};

const checkRule = (rule: ValueRule, value: string, roots: string[]): string | null => {
  switch (rule.type) {
    case "root":
      if (!value.trim()) return "root is empty";
      try {
        parseRoot(value);
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    case "relativePath":
      if (value.startsWith("/")) return `The path '${value}' is not a relative path`;
      if (value.split("/").includes("..")) {
        return `Reference to parent directory '..' not allowed in path '${value}'`;
      }
      return null;
    case "repeat": {
      const parts = value.split("+").map((p) => p.trim().toLowerCase()).filter(Boolean);
      const isInt = (p: string) => OCAML_INT.test(p);
      const ok =
        parts.length === 0 ||
        (parts.length === 1 && (parts[0] === "watch" || isInt(parts[0]))) ||
        (parts.length === 2 && parts.includes("watch") && parts.some(isInt));
      return ok ? null : `Value of 'repeat' preference (${value}) should be either a number, 'watch' or 'watch+<number>'`;
    }
    case "enum":
      return rule.values.includes(value) ? null : `expects ${rule.values.map((v) => `'${v}'`).join(" or ")}`;
    case "rootRef":
      if (rule.special.includes(value)) return null;
      if (roots.length === 2 && resolveRootRef(value, roots) === null) {
        return `${value}\nis not uniquely identifying one of the current roots`;
      }
      return null;
    case "command":
      return value ? null : "expects a command";
  }
};

/** Nouture syncs a folder on the phone with an ssh:// root. */
const checkNoutureRoots = (roots: string[]): Issue[] => {
  const parsed = roots.map((r) => {
    try {
      return parseRoot(r);
    } catch {
      return null;
    }
  });
  if (parsed.some((r) => r === null)) return []; // already reported per line
  const local = parsed.filter((r) => r!.protocol === "file" && !r!.host);
  const ssh = parsed.filter((r) => r!.protocol === "ssh");
  const issues: Issue[] = [];
  const error = (message: string) => issues.push({ pref: "root", severity: "error", message });
  if (parsed.some((r) => r!.protocol === "socket")) {
    error("Nouture only supports ssh:// roots for the server (socket connections aren't encrypted).");
  }
  if (local.length !== 1 || ssh.length !== 1) {
    error("Nouture needs one folder on this phone and one ssh:// root.");
  } else if (!local[0]!.path?.startsWith("/")) {
    error("The root on this phone must be an absolute path, like /storage/emulated/0/Documents/org.");
  }
  return issues;
};

/** Every alias unison accepts for a preference (for display). */
export const aliasesOf = (name: string) =>
  Object.entries(ALIASES).flatMap(([alias, target]) => (target === name ? [alias] : []));
