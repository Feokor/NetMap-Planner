/**
 * Библиотека шаблонов устройств: глобальная, не привязана к проекту.
 * Хранится тем же storage-слоем, что и настройки (JSON/Electron/Tauri/localStorage).
 */

import { BUILTIN_TEMPLATES, type DeviceTemplate } from '../core/templates';
import { storage } from './storage';

const TEMPLATES_KEY = 'templates';
const VERSION = 1;

interface StoredTemplates {
  version: number;
  items: DeviceTemplate[];
}

function clone(items: DeviceTemplate[]): DeviceTemplate[] {
  return items.map((item) => ({
    ...item,
    tags: [...item.tags],
    ports: item.ports.map((port) => ({ ...port })),
  }));
}

export async function loadTemplates(): Promise<DeviceTemplate[]> {
  try {
    const stored = await storage.get<StoredTemplates>(TEMPLATES_KEY);
    if (stored && Array.isArray(stored.items)) return stored.items;
  } catch {
    /* повреждённое хранилище — засеем заново */
  }
  const seeded = clone(BUILTIN_TEMPLATES);
  await storage.set<StoredTemplates>(TEMPLATES_KEY, { version: VERSION, items: seeded });
  return seeded;
}

export async function saveTemplates(items: DeviceTemplate[]): Promise<void> {
  await storage.set<StoredTemplates>(TEMPLATES_KEY, { version: VERSION, items });
}

/** Специально для кнопки «Сохранить как шаблон» в карточке устройства. */
export async function addTemplate(template: DeviceTemplate): Promise<DeviceTemplate[]> {
  const items = await loadTemplates();
  const next = [...items, template];
  await saveTemplates(next);
  return next;
}
