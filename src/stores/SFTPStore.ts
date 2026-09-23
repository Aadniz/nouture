import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { SFTP, SFTPConnectionConfig, SFTPFileInfo } from "../plugins/sftp";

interface SyncProgress {
  totalFiles: number;
  syncedFiles: number;
  currentFile: string;
  status: "idle" | "connecting" | "syncing" | "completed" | "error";
}

interface SFTPState {
  // Connection
  connectionConfig: SFTPConnectionConfig | null;
  isConnected: boolean;
  connectionError: string | null;

  // Sync
  syncProgress: SyncProgress;
  lastSyncTimestamp: number | null;
  syncError: string | null;

  // Remote files
  remoteFiles: SFTPFileInfo[];

  // Actions
  setConnectionConfig: (config: SFTPConnectionConfig) => void;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  listFiles: (path: string) => Promise<SFTPFileInfo[]>;
  syncNotes: (remotePath: string, localPath: string) => Promise<string[]>;
  resetConnection: () => void;
}

export const useSFTPStore = create<SFTPState>()(
  persist(
    (set, get) => ({
      // Initial state
      connectionConfig: null,
      isConnected: false,
      connectionError: null,

      syncProgress: {
        totalFiles: 0,
        syncedFiles: 0,
        currentFile: "",
        status: "idle",
      },
      lastSyncTimestamp: null,
      syncError: null,
      remoteFiles: [],

      // Actions
      setConnectionConfig: (config) => {
        set({ connectionConfig: config, connectionError: null });
      },

      connect: async () => {
        const { connectionConfig } = get();
        if (!connectionConfig) {
          set({ connectionError: "No connection configuration" });
          return false;
        }

        set({
          connectionError: null,
          syncProgress: { ...get().syncProgress, status: "connecting" },
        });

        try {
          const result = await SFTP.connect(connectionConfig);

          if (result.success) {
            set({
              isConnected: true,
              connectionError: null,
              syncProgress: { ...get().syncProgress, status: "idle" },
            });
          } else {
            set({
              isConnected: false,
              connectionError: result.message,
              syncProgress: { ...get().syncProgress, status: "error" },
            });
          }

          return result.success;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Connection failed";
          set({
            isConnected: false,
            connectionError: errorMessage,
            syncProgress: { ...get().syncProgress, status: "error" },
          });
          return false;
        }
      },

      disconnect: async () => {
        try {
          await SFTP.disconnect();
        } finally {
          set({
            isConnected: false,
            connectionError: null,
            remoteFiles: [],
            syncProgress: {
              totalFiles: 0,
              syncedFiles: 0,
              currentFile: "",
              status: "idle",
            },
          });
        }
      },

      listFiles: async (path: string) => {
        try {
          const result = await SFTP.listFiles(path);
          const files = result.files as SFTPFileInfo[];
          set({ remoteFiles: files });
          return files;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to list files";
          set({ connectionError: errorMessage });
          return [];
        }
      },

      syncNotes: async (remotePath: string, localPath: string) => {
        set({
          syncProgress: {
            totalFiles: 0,
            syncedFiles: 0,
            currentFile: "Preparing sync...",
            status: "syncing",
          },
          syncError: null,
        });

        try {
          // First, count total files for progress
          const filesResult = await SFTP.listFiles(remotePath);
          const remoteFiles = filesResult.files as SFTPFileInfo[];
          const totalFiles = countFilesRecursive(remoteFiles);

          set({
            syncProgress: {
              totalFiles,
              syncedFiles: 0,
              currentFile: "Starting sync...",
              status: "syncing",
            },
          });

          // Perform the actual sync
          const result = await SFTP.syncDirectory(remotePath, localPath);

          if (result.success) {
            set({
              syncProgress: {
                totalFiles,
                syncedFiles: result.syncedFiles?.length ?? 0,
                currentFile: "",
                status: "completed",
              },
              lastSyncTimestamp: Date.now(),
              syncError: null,
            });
            return result.syncedFiles ?? [];
          } else {
            set({
              syncProgress: {
                ...get().syncProgress,
                status: "error",
              },
              syncError: result.message,
            });
            return [];
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Sync failed";
          set({
            syncProgress: {
              ...get().syncProgress,
              status: "error",
            },
            syncError: errorMessage,
          });
          return [];
        }
      },

      resetConnection: () => {
        get().disconnect();
        set({
          connectionConfig: null,
          connectionError: null,
          syncError: null,
          lastSyncTimestamp: null,
          remoteFiles: [],
          syncProgress: {
            totalFiles: 0,
            syncedFiles: 0,
            currentFile: "",
            status: "idle",
          },
        });
      },
    }),
    {
      name: "sftp-storage",
      storage: createJSONStorage(() => localStorage),
      // Only persist non-sensitive and non-transient data
      partialize: (state) => ({
        connectionConfig: state.connectionConfig
          ? {
              ...state.connectionConfig,
              password: undefined, // Never persist password
              privateKey: undefined, // Never persist private key
              passphrase: undefined,
            }
          : null,
        lastSyncTimestamp: state.lastSyncTimestamp,
      }),
    }
  )
);

// Helper function to count files recursively
function countFilesRecursive(files: SFTPFileInfo[]): number {
  return files.filter((f) => !f.isDirectory).length;
  // Note: This is simplified. For actual recursive counting,
  // you'd need to traverse directories server-side or make multiple calls
}

// Selector hooks for performance
export const useConnectionStatus = () =>
  useSFTPStore((state) => ({
    isConnected: state.isConnected,
    connectionError: state.connectionError,
  }));

export const useSyncStatus = () =>
  useSFTPStore((state) => ({
    syncProgress: state.syncProgress,
    lastSyncTimestamp: state.lastSyncTimestamp,
    syncError: state.syncError,
  }));

export const useConnectionConfig = () =>
  useSFTPStore((state) => ({
    connectionConfig: state.connectionConfig,
    setConnectionConfig: state.setConnectionConfig,
  }));
