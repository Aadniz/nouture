import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface NotesState {
  /** Unsaved editor text per file, so leaving a note never loses edits */
  drafts: Record<string, string>;
  /** Notes left off the front page; only the note browser lists them */
  hidden: string[];
  /** Notes always on the front page, first, in the order they were pinned */
  pinned: string[];

  setDraft: (path: string, text: string | null) => void;
  /** Hiding a note unpins it */
  setHidden: (path: string, hidden: boolean) => void;
  /** Pinning a note shows it again */
  setPinned: (path: string, pinned: boolean) => void;
  /** The note was renamed: what's kept about it moves along */
  moveNote: (from: string, to: string) => void;
  /** The note was deleted */
  forgetNote: (path: string) => void;
}

const without = (list: string[], path: string) => list.filter((p) => p !== path);

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      drafts: {},
      hidden: [],
      pinned: [],

      setDraft: (path, text) => {
        const { [path]: _, ...drafts } = get().drafts;
        set({ drafts: text === null ? drafts : { ...drafts, [path]: text } });
      },

      setHidden: (path, hidden) => {
        const state = get();
        set({
          hidden: hidden ? [...without(state.hidden, path), path] : without(state.hidden, path),
          pinned: hidden ? without(state.pinned, path) : state.pinned,
        });
      },

      setPinned: (path, pinned) => {
        const state = get();
        set({
          pinned: pinned ? [...without(state.pinned, path), path] : without(state.pinned, path),
          hidden: pinned ? without(state.hidden, path) : state.hidden,
        });
      },

      moveNote: (from, to) => {
        const { drafts, hidden, pinned } = get();
        const { [from]: draft, ...rest } = drafts;
        set({
          drafts: draft === undefined ? drafts : { ...rest, [to]: draft },
          hidden: hidden.map((p) => (p === from ? to : p)),
          pinned: pinned.map((p) => (p === from ? to : p)),
        });
      },

      forgetNote: (path) => {
        const { [path]: _, ...drafts } = get().drafts;
        set({ drafts, hidden: without(get().hidden, path), pinned: without(get().pinned, path) });
      },
    }),
    {
      name: "notes-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
