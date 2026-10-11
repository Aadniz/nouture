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
  /**
   * The front page: the pinned notes first, then the most recently edited
   * .org files under the roots, newest first; never the hidden ones. `total`
   * is how many it could show.
   */
  recentNotes(options: {
    roots: string[];
    limit: number;
    hidden?: string[];
    pinned?: string[];
  }): Promise<{ notes: NotePreview[]; total: number }>;
  hasAllFilesAccess(): Promise<{ granted: boolean }>;
  /** Opens Android's "All files access" settings page for Nouture. */
  requestAllFilesAccess(): Promise<void>;
  /** Recursive listing; hidden files and folders are skipped. */
  listDir(options: { path: string }): Promise<{ entries: NoteEntry[] }>;
  stat(options: {
    path: string;
  }): Promise<{ exists: boolean; size: number; hash: string | null }>;
  readFile(options: {
    path: string;
  }): Promise<{ text: string; size: number; hash: string }>;
  /**
   * With expectedHash, refuses to overwrite a file that changed meanwhile.
   * (Hashes, not mtimes: Android's shared storage puts old mtimes back.)
   */
  writeFile(options: {
    path: string;
    text: string;
    expectedHash?: string;
  }): Promise<{ conflict: boolean; hash: string }>;
  createFile(options: { path: string; text?: string }): Promise<NoteEntry>;
  /** Deletes a file, never a folder. */
  deleteFile(options: { path: string }): Promise<void>;
  /** Renames a file within its folder. */
  renameFile(options: { path: string; name: string }): Promise<NoteEntry>;
}
