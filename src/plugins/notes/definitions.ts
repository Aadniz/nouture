export interface NoteEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
}

export interface NotePreview {
  path: string;
  name: string;
  mtime: number;
  text: string;
  /** Lines (0-based, inclusive) that changed in the last edit, if known */
  edited?: { start: number; end: number };
}

export interface NotesPlugin {
  /** The most recently edited .org files under the roots, newest first. */
  recentNotes(options: {
    roots: string[];
    limit: number;
  }): Promise<{ notes: NotePreview[]; total: number }>;
  hasAllFilesAccess(): Promise<{ granted: boolean }>;
  /** Opens Android's "All files access" settings page for Nouture. */
  requestAllFilesAccess(): Promise<void>;
  /** Recursive listing; hidden files and folders are skipped. */
  listDir(options: { path: string }): Promise<{ entries: NoteEntry[] }>;
  stat(options: {
    path: string;
  }): Promise<{ exists: boolean; mtime: number; size: number }>;
  readFile(options: {
    path: string;
  }): Promise<{ text: string; mtime: number; size: number }>;
  /** With expectedMtime, refuses to overwrite a file that changed meanwhile. */
  writeFile(options: {
    path: string;
    text: string;
    expectedMtime?: number;
  }): Promise<{ conflict: boolean; mtime: number }>;
  createFile(options: { path: string; text?: string }): Promise<NoteEntry>;
}
