import { WebPlugin } from "@capacitor/core";
import type {
  ConflictDetails,
  ConnectionTest,
  Profile,
  SshKey,
  SyncResult,
  UnisonPlugin,
} from "./definitions";

/** unison only runs on Android; in the browser everything is unavailable. */
export class UnisonWeb extends WebPlugin implements UnisonPlugin {
  async requestLocalNetwork(): Promise<{ granted: boolean }> {
    return { granted: true };
  }

  async getInfo(): Promise<{ unisonVersion: string; hostname: string; home: string }> {
    throw this.unimplemented("Not available on web");
  }

  async listProfiles(): Promise<{ profiles: Profile[] }> {
    return { profiles: [] };
  }

  async readProfile(): Promise<{ text: string }> {
    throw this.unimplemented("Not available on web");
  }

  async writeProfile(): Promise<Profile> {
    throw this.unimplemented("Not available on web");
  }

  async deleteProfile(): Promise<void> {
    throw this.unimplemented("Not available on web");
  }

  async setAutoSync(): Promise<Profile> {
    throw this.unimplemented("Not available on web");
  }

  async setColor(): Promise<Profile> {
    throw this.unimplemented("Not available on web");
  }

  async sync(): Promise<void> {
    throw this.unimplemented("Not available on web");
  }

  async testConnection(): Promise<ConnectionTest> {
    throw this.unimplemented("Not available on web");
  }

  async trustHost(): Promise<void> {
    throw this.unimplemented("Not available on web");
  }

  async readSshFile(): Promise<{ text: string }> {
    throw this.unimplemented("Not available on web");
  }

  async writeSshFile(): Promise<void> {
    throw this.unimplemented("Not available on web");
  }

  async listKeys(): Promise<{ keys: SshKey[] }> {
    return { keys: [] };
  }

  async generateKey(): Promise<SshKey> {
    throw this.unimplemented("Not available on web");
  }

  async importKey(): Promise<SshKey> {
    throw this.unimplemented("Not available on web");
  }

  async deleteKey(): Promise<void> {
    throw this.unimplemented("Not available on web");
  }

  async readLog(): Promise<{ text: string }> {
    throw this.unimplemented("Not available on web");
  }

  async conflictDetails(): Promise<ConflictDetails> {
    throw this.unimplemented("Not available on web");
  }

  async resolveConflict(): Promise<{ resolved: boolean; result: SyncResult }> {
    throw this.unimplemented("Not available on web");
  }
}
