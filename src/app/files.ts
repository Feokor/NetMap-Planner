/**
 * Сохранение и открытие файлов.
 *
 * Electron: нативные диалоги через IPC — HTML-скачивание (`<a download>` +
 * will-download) и `<input type=file>` в десктопной сборке работают ненадёжно.
 * Android/iOS: пишем файл в кэш приложения и отдаём системному «Поделиться»,
 * потому что WebView не умеет скачивать blob-ссылки. Браузер: blob-ссылки
 * и обычный выбор файла.
 */

import { Capacitor } from '@capacitor/core';
import type { FileFilter } from './storage';
import { isDesktop } from './storage';

export function hasDesktopDialogs(): boolean {
  return Boolean(isDesktop && window.vibe?.saveFile && window.vibe?.openFile);
}

function saveViaBrowser(filename: string, blob: Blob): boolean {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

/**
 * Android/iOS: файл во временный каталог + системный лист «Поделиться».
 * Через него пользователь сохраняет в «Файлы», отправляет в мессенджер и т.п.
 */
async function saveOnMobile(filename: string, bytes: Uint8Array): Promise<boolean> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');

  await Filesystem.writeFile({
    path: filename,
    data: bytesToBase64(bytes),
    directory: Directory.Cache,
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });

  try {
    await Share.share({ title: filename, url: uri, files: [uri], dialogTitle: filename });
  } catch (error) {
    // Закрытый лист «Поделиться» — не ошибка экспорта.
    if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return true;
    throw error;
  }
  return true;
}

export async function saveTextFile(
  defaultName: string,
  text: string,
  filters?: FileFilter[],
): Promise<boolean> {
  const bridge = window.vibe;
  if (isDesktop && bridge?.saveFile) {
    const result = await bridge.saveFile({ defaultName, data: text, filters });
    if (result.error) throw new Error(result.error);
    return !result.canceled;
  }
  if (Capacitor.isNativePlatform()) {
    return saveOnMobile(defaultName, new TextEncoder().encode(text));
  }
  return saveViaBrowser(defaultName, new Blob([text], { type: 'text/plain;charset=utf-8' }));
}

export async function saveBinaryFile(
  defaultName: string,
  bytes: Uint8Array,
  filters?: FileFilter[],
): Promise<boolean> {
  const bridge = window.vibe;
  if (isDesktop && bridge?.saveFile) {
    const result = await bridge.saveFile({ defaultName, data: bytes, filters });
    if (result.error) throw new Error(result.error);
    return !result.canceled;
  }
  if (Capacitor.isNativePlatform()) {
    return saveOnMobile(defaultName, bytes);
  }
  return saveViaBrowser(defaultName, new Blob([bytes as unknown as BlobPart]));
}

export type OpenTextResult =
  | { status: 'opened'; text: string; filePath: string }
  | { status: 'canceled' }
  | { status: 'unavailable' };

export async function openTextFile(filters?: FileFilter[]): Promise<OpenTextResult> {
  const bridge = window.vibe;
  if (!isDesktop || !bridge?.openFile) return { status: 'unavailable' };
  const result = await bridge.openFile({ filters });
  if (result.error) throw new Error(result.error);
  if (result.canceled || typeof result.text !== 'string') return { status: 'canceled' };
  return { status: 'opened', text: result.text, filePath: result.filePath ?? '' };
}
