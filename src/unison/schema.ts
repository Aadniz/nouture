import generated from "./prefs.generated.json";

/**
 * Unison's preferences, extracted from the sources of the bundled unison by
 * scripts/extract-unison-prefs.py, plus the value rules unison applies and
 * what Nouture can support on Android.
 */

export type PrefKind =
  | "bool"
  | "int"
  | "string"
  | "stringList"
  | "boolDefault"
  | "pattern"
  | "custom";

export interface PrefSpec {
  name: string;
  kind: PrefKind;
  /** e.g. ["Basic", "Sync"], ["Advanced", "Remote"], ["Expert"], ["Internal", "Pseudo"] */
  category: string[];
  cliOnly: boolean;
  deprecated: boolean;
  default?: boolean | number | string | null;
  doc: string;
  help?: string;
}

const data = generated as {
  prefs: PrefSpec[];
  aliases: Record<string, string>;
  removed: string[];
};

export const PREFS: Record<string, PrefSpec> = Object.fromEntries(
  data.prefs.map((p) => [p.name, p])
);

/** Unison also accepts these names, e.g. "mirror" for "backup". */
export const ALIASES = data.aliases;
export const REMOVED = new Set(data.removed);

export const canonical = (name: string) => ALIASES[name] ?? name;

/** Preferences that accumulate values; the others keep their last value. */
export const isList = (spec: PrefSpec) =>
  spec.kind === "stringList" ||
  spec.kind === "pattern" ||
  spec.name === "path";

// ---------------------------------------------------------------------------
// Value grammar beyond the basic kinds (see recon.ml, stasher.ml, globals.ml,
// path.ml, uicommon.ml and clroot.ml in the unison sources)

export type ValueRule =
  | { type: "root" }
  | { type: "relativePath" }
  | { type: "repeat" }
  | { type: "enum"; values: string[] }
  /** A root (or a unique prefix/suffix of one), optionally "newer"/"older" */
  | { type: "rootRef"; special: string[] }
  | { type: "command" };

const ROOT_OR_AGE: ValueRule = { type: "rootRef", special: ["newer", "older"] };
const ROOT: ValueRule = { type: "rootRef", special: [] };

export const VALUE_RULES: Record<string, ValueRule> = {
  root: { type: "root" },
  path: { type: "relativePath" },
  repeat: { type: "repeat" },
  backuploc: { type: "enum", values: ["local", "central"] },
  prefer: ROOT_OR_AGE,
  force: ROOT_OR_AGE,
  nocreation: ROOT,
  nodeletion: ROOT,
  noupdate: ROOT,
};

/** Pattern preferences whose patterns carry "-> value". */
export const PATTERN_VALUES: Record<string, ValueRule> = {
  preferpartial: ROOT_OR_AGE,
  forcepartial: ROOT_OR_AGE,
  nocreationpartial: ROOT,
  nodeletionpartial: ROOT,
  noupdatepartial: ROOT,
  merge: { type: "command" },
};

export const PATTERN_KINDS = ["Name", "Path", "BelowPath", "Regex"] as const;

// ---------------------------------------------------------------------------
// How Nouture runs unison on Android

export interface Support {
  level:
    /** Nouture sets it itself */
    | "managed"
    /** Can't work in Nouture: an error */
    | "unsupported"
    /** A Linux feature Android's shared storage lacks: not offered */
    | "incompatible"
    /** Irrelevant in Nouture: kept in the profile, not offered */
    | "hidden";
  note: string;
  /** Values that deserve a warning when found in a profile */
  warnIf?: (value: string) => boolean;
}

const INTERACTIVE = "Only matters in interactive unison; Nouture always runs in batch mode.";
const STORAGE = "Android's shared storage has no owners, groups, ACLs or extended attributes.";
const FAT = "Android's shared storage is case-insensitive and has no Unix permissions or symbolic links; fat sets this right.";
const isOn = (v: string) => v !== "false" && v !== "no" && v !== "";
const isZero = (v: string) => Number(v.replace(/_/g, "")) === 0;

export const ANDROID: Record<string, Support> = {
  // Nouture runs unison itself
  batch: { level: "managed", note: "Nouture always runs unison in batch mode, like your Emacs hook." },
  fastcheck: {
    level: "managed",
    note: "Nouture always compares file contents: Android's shared storage puts a replaced file's old modification time back, so a quick check by time and size misses edits.",
  },
  ignorelocks: {
    level: "managed",
    note: "Nouture always ignores stale locks; Android may kill a sync midway, and Nouture never runs a profile twice at once.",
  },

  // Can't work in Nouture
  sshcmd: {
    level: "unsupported",
    note: "Nouture connects through its own SSH layer; configure hosts in ~/.ssh/config instead.",
  },
  repeat: { level: "unsupported", note: "Nouture runs unison once per sync; use Auto sync instead." },
  watch: { level: "unsupported", note: "No unison-fsmonitor on Android; Nouture watches the folder itself." },
  copyprog: { level: "unsupported", note: "rsync isn't available on Android." },
  copyprogrest: { level: "unsupported", note: "rsync isn't available on Android." },
  copythreshold: { level: "unsupported", note: "rsync isn't available on Android." },

  // Linux features Android's shared storage doesn't have
  owner: { level: "incompatible", note: STORAGE, warnIf: isOn },
  group: { level: "incompatible", note: STORAGE, warnIf: isOn },
  numericids: { level: "incompatible", note: STORAGE, warnIf: isOn },
  acl: { level: "incompatible", note: STORAGE, warnIf: isOn },
  xattrs: { level: "incompatible", note: STORAGE, warnIf: isOn },
  xattrignore: { level: "incompatible", note: STORAGE },
  xattrignorenot: { level: "incompatible", note: STORAGE },
  perms: { level: "incompatible", note: FAT, warnIf: (v) => !isZero(v) },
  times: {
    level: "incompatible",
    note: "Android's shared storage puts a replaced file's old modification time back a few seconds later, so synced times don't stick and cause conflicts.",
    warnIf: (v) => v === "true",
  },
  dontchmod: { level: "incompatible", note: FAT, warnIf: (v) => v === "false" },
  ignorecase: { level: "incompatible", note: FAT, warnIf: (v) => v === "false" || v === "no" },
  ignoreinodenumbers: { level: "incompatible", note: FAT },
  links: { level: "incompatible", note: FAT, warnIf: (v) => v === "true" || v === "yes" },
  merge: {
    level: "incompatible",
    note: "Merge programs like diff3 or emacs don't exist on Android.",
    warnIf: () => true,
  },

  // Irrelevant in Nouture
  silent: {
    level: "hidden",
    note: "Nouture reads unison's output to show results; silent hides them.",
    warnIf: isOn,
  },
  logfile: {
    level: "hidden",
    note: "Nouture's sync log shows ~/.unison/unison.log; it won't find another logfile.",
    warnIf: () => true,
  },
  showarchive: { level: "hidden", note: "A diagnostic for setting up rootalias." },
  label: { level: "hidden", note: "Only for unison's profile menu." },
  copymax: { level: "hidden", note: "Only used together with copyprog." },
  rsrc: { level: "hidden", note: "macOS resource forks." },
  auto: { level: "hidden", note: INTERACTIVE },
  confirmbigdel: { level: "hidden", note: INTERACTIVE },
  confirmmerge: { level: "hidden", note: INTERACTIVE },
  diff: { level: "hidden", note: INTERACTIVE },
  sortbysize: { level: "hidden", note: INTERACTIVE },
  sortnewfirst: { level: "hidden", note: INTERACTIVE },
  sortfirst: { level: "hidden", note: INTERACTIVE },
  sortlast: { level: "hidden", note: INTERACTIVE },
  addprefsto: { level: "hidden", note: INTERACTIVE },
  color: { level: "hidden", note: "Terminal colors." },
  dumbtty: { level: "hidden", note: "Terminal settings." },
  height: { level: "hidden", note: "Graphical interface only." },
  key: { level: "hidden", note: "Graphical interface only." },
  killserver: { level: "hidden", note: "Only for socket servers." },
  sshargs: {
    level: "hidden",
    note: "The server's port and user are set with the root; other ssh options belong in ~/.ssh/config.",
  },
};

/** Whether a value found in a profile deserves the preference's Android note as a warning. */
export const warnsOnAndroid = (name: string, value: string) => {
  const support = ANDROID[name];
  return !!support?.warnIf?.(value);
};

// ---------------------------------------------------------------------------
// The profile page

/** Shown with the roots, as it describes the Android folder */
export const ROOT_PREFS = ["fat"];

/**
 * The page's sections, most common options first. The order follows what
 * people set in real profiles (a survey of public .prf files on GitHub) and
 * the sample profiles in unison's manual.
 */
export const SECTIONS: { title: string; prefs: string[]; advanced?: boolean }[] = [
  { title: "What to sync", prefs: ["ignore", "ignorenot", "path"] },
  { title: "Conflicts", prefs: ["prefer", "copyonconflict"] },
  {
    title: "Backups",
    advanced: true,
    prefs: ["backup", "backupnot", "maxbackups", "backuploc", "backupdir", "backupprefix", "backupsuffix", "backupcurr", "backupcurrnot"],
  },
  { title: "Conflict rules", advanced: true, prefs: ["force", "preferpartial", "forcepartial"] },
  {
    title: "Protect a replica",
    advanced: true,
    prefs: ["noupdate", "nodeletion", "nocreation", "noupdatepartial", "nodeletionpartial", "nocreationpartial", "immutable", "immutablenot", "atomic"],
  },
  {
    title: "Server",
    advanced: true,
    prefs: ["servercmd", "addversionno", "rootalias", "clientHostName", "rsync", "xferbycopying"],
  },
  {
    title: "Speed and limits",
    advanced: true,
    prefs: ["maxthreads", "maxsizethreshold", "maxerrors", "retry", "moves-experimental"],
  },
  {
    title: "Other",
    advanced: true,
    prefs: ["follow", "log", "terse", "contactquietly", "mountpoint", "unicode", "ignorearchives"],
  },
];

/** Whether a preference may appear in a profile at all. */
export const isProfilePref = (spec: PrefSpec) =>
  !spec.cliOnly && spec.category.join(" ") !== "Internal Pseudo";

/** Preferences the page offers a field for */
export const OFFERED = new Set(["root", ...ROOT_PREFS, ...SECTIONS.flatMap((s) => s.prefs)]);

/** Every preference unison accepts in a profile (for checking the layout) */
export const ALL_PREFS = data.prefs;
