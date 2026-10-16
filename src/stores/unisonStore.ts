import { create } from "zustand";
import { Profile, SshKey, SyncResult, Unison } from "../plugins/unison";

const MAX_OUTPUT_LINES = 500;

interface UnisonState {
  profiles: Profile[];
  error: string | null;
  /** Live output of each profile's current (or last) run */
  output: Record<string, string[]>;
  /** The keys in ~/.ssh: a profile syncing over SSH needs one */
  keys: SshKey[];

  refresh: () => Promise<void>;
  refreshKeys: () => Promise<void>;
  saveProfile: (name: string, text: string) => Promise<void>;
  deleteProfile: (name: string) => Promise<void>;
  setAutoSync: (name: string, enabled: boolean) => Promise<void>;
  setColor: (name: string, color: string | null) => Promise<void>;
  sync: (name: string, reason?: string) => Promise<void>;
  /** Android's version of the Emacs hooks: sync the profile owning `path`. */
  syncFile: (path: string, reason: "open" | "save") => void;
}

export const useUnisonStore = create<UnisonState>()((set, get) => ({
  profiles: [],
  error: null,
  output: {},
  keys: [],

  refresh: async () => {
    try {
      const { profiles } = await Unison.listProfiles();
      set({ profiles, error: null });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  refreshKeys: async () => {
    const { keys } = await Unison.listKeys();
    set({ keys });
  },

  saveProfile: async (name, text) => {
    const profile = await Unison.writeProfile({ name, text });
    set({ profiles: upsert(get().profiles, profile) });
  },

  deleteProfile: async (name) => {
    await Unison.deleteProfile({ name });
    set({ profiles: get().profiles.filter((p) => p.name !== name) });
  },

  setAutoSync: async (name, enabled) => {
    const profile = await Unison.setAutoSync({ name, enabled });
    set({ profiles: upsert(get().profiles, profile) });
  },

  setColor: async (name, color) => {
    const profile = await Unison.setColor({ name, color });
    set({ profiles: upsert(get().profiles, profile) });
  },

  sync: async (name, reason = "manual") => {
    set({ error: null });
    try {
      await Unison.sync({ name, reason });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  syncFile: (path, reason) => {
    const profile = profileForPath(get().profiles, path);
    if (profile?.autoSync) get().sync(profile.name, reason);
  },
}));

/** Unison got through the run: everything not skipped or failed is in sync */
export const completed = (result: SyncResult) =>
  !!result.summary && result.exitCode >= 0 && result.exitCode <= 2;

export const profileForPath = (profiles: Profile[], path: string) =>
  profiles.find(
    (p) =>
      p.localRoot && (path === p.localRoot || path.startsWith(p.localRoot + "/"))
  );

const upsert = (profiles: Profile[], profile: Profile) =>
  [...profiles.filter((p) => p.name !== profile.name), profile].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

const updateProfile = (name: string, change: Partial<Profile>) =>
  useUnisonStore.setState((state) => ({
    profiles: state.profiles.map((p) =>
      p.name === name ? { ...p, ...change } : p
    ),
  }));

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Native events keep the store current, also for syncs started natively
// (app resume, folder watcher)
Unison.addListener("syncStarted", ({ profile }) => {
  updateProfile(profile, { running: true });
  useUnisonStore.setState((state) => ({
    output: { ...state.output, [profile]: [] },
  }));
});

Unison.addListener("syncOutput", ({ profile, line }) => {
  useUnisonStore.setState((state) => ({
    output: {
      ...state.output,
      [profile]: [...(state.output[profile] ?? []), line].slice(-MAX_OUTPUT_LINES),
    },
  }));
});

Unison.addListener("syncFinished", (result) => {
  updateProfile(result.profile, {
    running: false,
    lastResult: result,
    ...(completed(result) ? { lastSyncedAt: result.finishedAt } : {}),
  });
});
