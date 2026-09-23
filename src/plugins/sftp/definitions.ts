export interface SFTPConnectionConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface SFTPFileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  lastModified: number;
}

export interface SFTPSyncResult {
  success: boolean;
  message: string;
  syncedFiles?: string[];
}

export interface SFTPPlugin {
  connect(
    config: SFTPConnectionConfig
  ): Promise<{ success: boolean; message: string }>;
  disconnect(): Promise<{ success: boolean; message: string }>;
  listFiles(path: string): Promise<{ files: SFTPFileInfo[] }>;
  downloadFile(
    remotePath: string,
    localPath: string
  ): Promise<{ success: boolean; message: string }>;
  uploadFile(
    localPath: string,
    remotePath: string
  ): Promise<{ success: boolean; message: string }>;
  syncDirectory(remotePath: string, localPath: string): Promise<SFTPSyncResult>;
  createDirectory(
    remotePath: string
  ): Promise<{ success: boolean; message: string }>;
  deleteFile(
    remotePath: string
  ): Promise<{ success: boolean; message: string }>;
  checkConnection(): Promise<{ connected: boolean }>;
}
