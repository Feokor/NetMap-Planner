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

/* --- Tauri ----------------------------------------------------------- */
/* В Tauri нет preload-моста: собираем тот же window.vibe на invoke().  */

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return api.invoke<T>(command, args);
}

function toBase64(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export const isTauri =
  typeof window !== 'undefined' &&
  Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);

if (isTauri && !window.vibe) {
  window.vibe = {
    platform: 'desktop',
    version: __APP_VERSION__,
    get: <T>(key: string) => invoke<T | null>('storage_get', { key }),
    set: <T>(key: string, value: T) => invoke<void>('storage_set', { key, value }),
    remove: (key: string) => invoke<void>('storage_remove', { key }),
    saveFile: (request) =>
      invoke<SaveFileResult>('file_save', {
        defaultName: request.defaultName,
        text: typeof request.data === 'string' ? request.data : null,
        base64: typeof request.data === 'string' ? null : toBase64(request.data),
        filters: request.filters ?? null,
      }),
    openFile: (request) => invoke<OpenFileResult>('file_open', { filters: request.filters ?? null }),
  };
}

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
