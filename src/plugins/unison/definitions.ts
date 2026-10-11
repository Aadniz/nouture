import type { PluginListenerHandle } from "@capacitor/core";

export interface SyncResult {
  profile: string;
  reason: string;
  startedAt: number;
  finishedAt: number;
  /** unison: 0 ok, 1 some files skipped, 2 non-fatal failures, 3 fatal error */
  exitCode: number;
  summary?: string;
  transferred: number;
  skipped: number;
  failed: number;
  conflicts: string[];
  /** Why unison skipped each conflict, e.g. "contents changed on both sides" */
  conflictReasons?: Record<string, string>;
  failedPaths?: string[];
  changed: string[];
  error?: string;
  untrustedHost: boolean;
  /** The server's key, when the sync stopped because it isn't trusted yet */
  unknownHostKey?: HostKey;
  output: string[];
}

export interface Profile {
  name: string;
  roots: string[];
  localRoot?: string;
  autoSync: boolean;
  running: boolean;
  lastResult: SyncResult | null;
  /** The last sync that got all the way through; a failed one doesn't count */
  lastSyncedAt: number | null;
}

export interface SshKey {
  name: string;
  publicKey: string;
  fingerprint: string;
}

export interface HostKey {
  host: string;
  type: string;
  key: string;
  fingerprint: string;
}

export interface ConnectionTest {
  ok: boolean;
  message: string;
  unknownHostKey?: HostKey;
}

export type SshFile = "config" | "known_hosts";

/** One replica's version of a conflicting file */
export interface ConflictSide {
  exists: boolean;
  size: number;
  /** Only known for the server: Android's storage doesn't keep mtimes reliably */
  mtime: number | null;
  /** null when missing, binary or too large to show */
  text: string | null;
  binary: boolean;
}

export interface ConflictDetails {
  path: string;
  reason?: string;
  serverHost?: string;
  android: ConflictSide;
  server: ConflictSide;
  /** The last version both sides agreed on, if Nouture recorded one */
  base: ConflictSide | null;
}

/** How to resolve: keep one side, keep both (Android's as a copy), or a merge */
export type ConflictChoice = "android" | "server" | "both" | "merged";

export interface UnisonPlugin {
  /** Android 17+ needs this to reach a server on the home network. */
  requestLocalNetwork(): Promise<{ granted: boolean }>;
  getInfo(): Promise<{ unisonVersion: string; hostname: string; home: string }>;
  listProfiles(): Promise<{ profiles: Profile[] }>;
  readProfile(options: { name: string }): Promise<{ text: string }>;
  writeProfile(options: { name: string; text: string }): Promise<Profile>;
  deleteProfile(options: { name: string }): Promise<void>;
  setAutoSync(options: { name: string; enabled: boolean }): Promise<Profile>;
  sync(options: { name: string; reason?: string }): Promise<void>;
  testConnection(options: { name: string }): Promise<ConnectionTest>;
  trustHost(options: Omit<HostKey, "fingerprint">): Promise<void>;
  readSshFile(options: { name: SshFile }): Promise<{ text: string }>;
  writeSshFile(options: { name: SshFile; text: string }): Promise<void>;
  listKeys(): Promise<{ keys: SshKey[] }>;
  generateKey(options: { name: string; comment?: string }): Promise<SshKey>;
  importKey(options: { name: string; privateKey: string }): Promise<SshKey>;
  deleteKey(options: { name: string }): Promise<void>;
  readLog(options?: { lines?: number }): Promise<{ text: string }>;
  conflictDetails(options: { name: string; path: string }): Promise<ConflictDetails>;
  /** Syncs just this path in the chosen direction, then everything. */
  resolveConflict(options: {
    name: string;
    path: string;
    keep: ConflictChoice;
    /** The merged text, for keep = "merged" */
    text?: string;
  }): Promise<{ resolved: boolean; result: SyncResult }>;

  addListener(
    event: "syncStarted",
    listener: (event: { profile: string; reason: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "syncOutput",
    listener: (event: { profile: string; line: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "syncFinished",
    listener: (result: SyncResult) => void
  ): Promise<PluginListenerHandle>;
}
