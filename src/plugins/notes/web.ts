import { WebPlugin } from "@capacitor/core";
import type { NoteEntry, NotePreview, NotesPlugin } from "./definitions";

export class NotesWeb extends WebPlugin implements NotesPlugin {
  async recentNotes(): Promise<{ notes: NotePreview[]; total: number }> {
    return { notes: [], total: 0 };
  }

  async hasAllFilesAccess(): Promise<{ granted: boolean }> {
    return { granted: false };
  }

  async requestAllFilesAccess(): Promise<void> {
    throw this.unimplemented("Not available on web");
  }

  async listDir(): Promise<{ entries: NoteEntry[] }> {
    return { entries: [] };
  }

  async stat(): Promise<{ exists: boolean; size: number; hash: string | null }> {
    throw this.unimplemented("Not available on web");
  }

  async readFile(): Promise<{ text: string; size: number; hash: string }> {
    throw this.unimplemented("Not available on web");
  }

  async writeFile(): Promise<{ conflict: boolean; hash: string }> {
    throw this.unimplemented("Not available on web");
  }

  async createFile(): Promise<NoteEntry> {
    throw this.unimplemented("Not available on web");
  }

  async deleteFile(): Promise<void> {
    throw this.unimplemented("Not available on web");
  }

  async renameFile(): Promise<NoteEntry> {
    throw this.unimplemented("Not available on web");
  }
}
