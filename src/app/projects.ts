/**
 * Хранилище проектов: индекс + отдельный JSON на каждый проект.
 * Работает поверх StorageApi (Electron → файлы, web/mobile → localStorage).
 */

import {
  type ProjectDocument,
  SCHEMA,
  createProject,
  migrateDocument,
  uid,
} from '../core/project';
import { storage } from './storage';
import { saveTextFile } from './files';

const INDEX_KEY = 'projects.index';
const projectKey = (id: string) => `project.${id}`;

export interface ProjectIndexEntry {
  id: string;
  name: string;
  description: string;
  updatedAt: number;
}

export async function readIndex(): Promise<ProjectIndexEntry[]> {
  const raw = await storage.get<ProjectIndexEntry[]>(INDEX_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item.id === 'string')
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

async function writeIndex(list: ProjectIndexEntry[]): Promise<void> {
  await storage.set(INDEX_KEY, list);
}

export async function saveProject(doc: ProjectDocument): Promise<ProjectDocument> {
  const next: ProjectDocument = { ...doc, schema: SCHEMA, updatedAt: Date.now() };
  await storage.set(projectKey(next.id), next);
  const index = await readIndex();
  const entry: ProjectIndexEntry = {
    id: next.id,
    name: next.name,
    description: next.description,
    updatedAt: next.updatedAt,
  };
  await writeIndex([entry, ...index.filter((item) => item.id !== next.id)]);
  return next;
}

export async function loadProject(id: string): Promise<ProjectDocument | null> {
  const raw = await storage.get<unknown>(projectKey(id));
  if (!raw) return null;
  try {
    return migrateDocument(raw);
  } catch {
    return null;
  }
}

export async function deleteProject(id: string): Promise<void> {
  await storage.remove(projectKey(id));
  const index = await readIndex();
  await writeIndex(index.filter((item) => item.id !== id));
}

export async function listProjects(): Promise<ProjectIndexEntry[]> {
  const index = await readIndex();
  if (index.length === 0) return [];
  const present: ProjectIndexEntry[] = [];
  for (const entry of index) {
    const doc = await storage.get<unknown>(projectKey(entry.id));
    if (doc) present.push(entry);
  }
  if (present.length !== index.length) await writeIndex(present);
  return present;
}

export async function createProjectWithName(name: string): Promise<ProjectDocument> {
  const doc = createProject(name.trim() || 'Новый проект');
  return saveProject(doc);
}

export async function duplicateProject(id: string): Promise<ProjectDocument | null> {
  const source = await loadProject(id);
  if (!source) return null;
  const copy: ProjectDocument = {
    ...source,
    id: uid('prj'),
    name: `${source.name} — копия`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return saveProject(copy);
}

export function suggestProjectName(existing: string[]): string {
  const used = new Set(existing.map((name) => name.trim().toLowerCase()));
  for (let i = 1; i < 1000; i++) {
    const candidate = `Проект ${i}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return 'Новый проект';
}

export async function downloadText(
  filename: string,
  text: string,
  mime = 'application/json',
): Promise<void> {
  const filters = mime.includes('json')
    ? [{ name: 'Netmap JSON', extensions: ['json'] }]
    : mime.includes('csv')
      ? [{ name: 'CSV', extensions: ['csv'] }]
      : undefined;
  await saveTextFile(filename, text, filters);
}

export function safeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return cleaned || 'project';
}
