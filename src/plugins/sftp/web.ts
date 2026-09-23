import { WebPlugin } from "@capacitor/core";
import type {
  SFTPPlugin,
  SFTPConnectionConfig,
  SFTPSyncResult,
} from "./definitions";

export class SFTPWeb extends WebPlugin implements SFTPPlugin {
  async connect(
    config: SFTPConnectionConfig
  ): Promise<{ success: boolean; message: string }> {
    throw this.unimplemented("Not available on web");
  }

  async disconnect(): Promise<{ success: boolean; message: string }> {
    throw this.unimplemented("Not available on web");
  }

  async listFiles(path: string): Promise<{ files: any[] }> {
    throw this.unimplemented("Not available on web");
  }

  async downloadFile(
    remotePath: string,
    localPath: string
  ): Promise<{ success: boolean; message: string }> {
    throw this.unimplemented("Not available on web");
  }

  async uploadFile(
    localPath: string,
    remotePath: string
  ): Promise<{ success: boolean; message: string }> {
    throw this.unimplemented("Not available on web");
  }

  async syncDirectory(
    remotePath: string,
    localPath: string
  ): Promise<SFTPSyncResult> {
    throw this.unimplemented("Not available on web");
  }

  async createDirectory(
    remotePath: string
  ): Promise<{ success: boolean; message: string }> {
    throw this.unimplemented("Not available on web");
  }

  async deleteFile(
    remotePath: string
  ): Promise<{ success: boolean; message: string }> {
    throw this.unimplemented("Not available on web");
  }

  async checkConnection(): Promise<{ connected: boolean }> {
    throw this.unimplemented("Not available on web");
  }
}
