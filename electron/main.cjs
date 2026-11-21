const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(DEV_URL);

function storageDir() {
  return path.join(app.getPath('userData'), 'storage');
}

function storageFile(key) {
  const safe = String(key).replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(storageDir(), `${safe}.json`);
}

async function ensureStorage() {
  await fs.mkdir(storageDir(), { recursive: true });
}

ipcMain.handle('storage:get', async (_event, key) => {
  try {
    const raw = await fs.readFile(storageFile(key), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

ipcMain.handle('storage:set', async (_event, key, value) => {
  await ensureStorage();
  const target = storageFile(key);
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temp, target);
});

ipcMain.handle('storage:remove', async (_event, key) => {
  try {
    await fs.unlink(storageFile(key));
  } catch {
    /* файла нет — это нормально */
  }
});

ipcMain.handle('file:save', async (event, options = {}) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  try {
    const defaultName = String(options.defaultName || 'file');

    // Режим автотеста: сохранить по заранее заданному пути без диалога.
    const forcedPath = process.env.VIBE_SAVE_TO;
    const target = forcedPath
      ? forcedPath
      : (
          await dialog.showSaveDialog(window ?? undefined, {
            defaultPath: path.join(app.getPath('downloads'), defaultName),
            filters: Array.isArray(options.filters) ? options.filters : undefined,
          })
        ).filePath;
    if (!target) return { canceled: true };

    const data = options.data;
    if (typeof data === 'string') {
      await fs.writeFile(target, data, 'utf8');
    } else if (data instanceof ArrayBuffer) {
      await fs.writeFile(target, Buffer.from(new Uint8Array(data)));
    } else if (data && ArrayBuffer.isView(data)) {
      await fs.writeFile(target, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    } else {
      throw new Error('Нет данных для сохранения');
    }
    return { canceled: false, filePath: target };
  } catch (error) {
    return { canceled: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('file:open', async (event, options = {}) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  try {
    // Режим автотеста: открыть заранее заданный файл без диалога.
    const forcedPath = process.env.VIBE_OPEN_FROM;
    let filePath = forcedPath;
    if (!filePath) {
      const result = await dialog.showOpenDialog(window ?? undefined, {
        properties: ['openFile'],
        filters: Array.isArray(options.filters) ? options.filters : undefined,
      });
      filePath = result.filePaths?.[0];
      if (result.canceled || !filePath) return { canceled: true };
    }
    const text = await fs.readFile(filePath, 'utf8');
    return { canceled: false, filePath, text };
  } catch (error) {
    return { canceled: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.on('app:version', (event) => {
  event.returnValue = app.getVersion();
});

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  dataDir: app.getPath('userData'),
}));

function setupDownloads(window) {
  const autoDir = process.env.VIBE_DOWNLOADS_DIR;
  window.webContents.session.on('will-download', (event, item) => {
    if (autoDir) {
      // Режим автотеста: сохранить молча в указанную папку.
      const target = path.join(autoDir, item.getFilename());
      item.setSavePath(target);
      item.once('done', (_e, state) => {
        if (state !== 'completed') console.error(`[download] ${state}`);
      });
      return;
    }
    const suggestion = path.join(app.getPath('downloads'), item.getFilename());
    // Пауза + асинхронный диалог: preventDefault() отменял загрузку и файл не сохранялся.
    item.pause();
    void dialog
      .showSaveDialog(window, { defaultPath: suggestion })
      .then(({ canceled, filePath }) => {
        if (canceled || !filePath) {
          item.cancel();
          return;
        }
        item.setSavePath(filePath);
        item.resume();
      })
      .catch(() => item.cancel());
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: Number(process.env.VIBE_WINDOW_WIDTH) || 1320,
    height: Number(process.env.VIBE_WINDOW_HEIGHT) || 880,
    minWidth: Number(process.env.VIBE_WINDOW_WIDTH) || 1100,
    minHeight: Number(process.env.VIBE_WINDOW_HEIGHT) || 600,
    backgroundColor: '#080c18',
    show: false,
    autoHideMenuBar: true,
    title: 'NetMap Planner',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  window.once('ready-to-show', () => window.show());
  setupDownloads(window);

  if (process.env.VIBE_EXPORT_TEST) {
    const kind = String(process.env.VIBE_EXPORT_TEST).toLowerCase();
    const exportJson = `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Экспорт JSON')?.click()`;
    const exportCsv = `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'CSV')?.click()`;
    const exportPng = `[...document.querySelectorAll('button')].find(b => (b.getAttribute('title') || '').startsWith('Экспорт PNG'))?.click()`;
    window.webContents.once('did-finish-load', () => {
      if (kind === 'png') {
        // PNG экспортируется только с холста: сначала переключаемся на вкладку.
        setTimeout(() => {
          void window.webContents.executeJavaScript(
            `[...document.querySelectorAll('.toggle-group button')].find(b => b.textContent.trim() === 'Холст')?.click()`,
          );
        }, 500);
        setTimeout(() => {
          void window.webContents.executeJavaScript(exportPng);
        }, 1600);
        return;
      }
      setTimeout(() => {
        void window.webContents.executeJavaScript(kind === 'csv' ? exportCsv : exportJson);
      }, 500);
    });
  }

  if (process.env.VIBE_IMPORT_TEST) {
    window.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void window.webContents.executeJavaScript(
          `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Импорт')?.click()`,
        );
      }, 500);
      setTimeout(() => {
        void window.webContents
          .executeJavaScript(
            `({
              title: document.querySelector('.page-title')?.textContent ?? null,
              error: document.querySelector('.error-box')?.textContent ?? null,
              buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).slice(0, 16),
            })`,
          )
          .then((info) => console.log('[import-test]', JSON.stringify(info)));
      }, 2600);
    });
  }

  if (process.env.VIBE_CAPTURE) {
    const delay = Number(process.env.VIBE_CAPTURE_DELAY) || 700;
    window.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (process.env.VIBE_JS) {
            await window.webContents.executeJavaScript(process.env.VIBE_JS);
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          const image = await window.webContents.capturePage();
          await fs.writeFile(process.env.VIBE_CAPTURE, image.toPNG());
          console.log(`[capture] ${process.env.VIBE_CAPTURE}`);
        } catch (error) {
          console.error('[capture] failed', error);
        } finally {
          if (process.env.VIBE_CAPTURE_EXIT) app.quit();
        }
      }, delay);
    });
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    void window.loadURL(DEV_URL);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return window;
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
