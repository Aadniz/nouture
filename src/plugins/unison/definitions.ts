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
  changed: string[];
  error?: string;
  untrustedHost: boolean;
  output: string[];
}

export interface Profile {
  name: string;
  roots: string[];
  localRoot?: string;
  autoSync: boolean;
  running: boolean;
  lastResult: SyncResult | null;
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
