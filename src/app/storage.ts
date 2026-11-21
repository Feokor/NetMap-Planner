/**
 * Единый интерфейс хранилища. На десктопе (Electron) — JSON-файлы в каталоге
 * приложения, в браузере и на мобильном — localStorage / плагин Filesystem.
 */

export interface StorageApi {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface SaveFileRequest {
  defaultName: string;
  data: string | Uint8Array | ArrayBuffer;
  filters?: FileFilter[];
}

export interface SaveFileResult {
  canceled: boolean;
  filePath?: string;
  error?: string;
}

export interface OpenFileRequest {
  filters?: FileFilter[];
}

export interface OpenFileResult {
  canceled: boolean;
  filePath?: string;
  text?: string;
  error?: string;
}

export interface DesktopBridge extends StorageApi {
  platform: 'desktop';
  version: string;
  saveFile?(request: SaveFileRequest): Promise<SaveFileResult>;
  openFile?(request: OpenFileRequest): Promise<OpenFileResult>;
}

declare global {
  interface Window {
    vibe?: DesktopBridge;
  }
}

const PREFIX = 'vibe:';

const webStorage: StorageApi = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  },
  async remove(key: string): Promise<void> {
    localStorage.removeItem(PREFIX + key);
  },
};

export const isDesktop = typeof window !== 'undefined' && Boolean(window.vibe);
export const storage: StorageApi = isDesktop && window.vibe ? window.vibe : webStorage;
export const appVersion: string = (isDesktop && window.vibe?.version) || __APP_VERSION__;
