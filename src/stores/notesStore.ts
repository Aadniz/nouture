import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface NotesState {
  /** Unsaved editor text per file, so leaving a note never loses edits */
  drafts: Record<string, string>;

  setDraft: (path: string, text: string | null) => void;
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      drafts: {},

      setDraft: (path, text) => {
        const { [path]: _, ...drafts } = get().drafts;
        set({ drafts: text === null ? drafts : { ...drafts, [path]: text } });
      },
    }),
    {
      name: "notes-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
