import type { Cidr, Family } from './ip';
import { cidrToString } from './ip';

export interface HistoryEntry {
  id: string;
  /** Исходная строка запроса. */
  input: string;
  /** Нормализованная сеть: 10.0.0.0/24. */
  cidr: string;
  family: Family;
  prefix: number;
  note: string;
  favorite: boolean;
  createdAt: number;
}

export const HISTORY_LIMIT = 400;

export function makeHistoryEntry(cidr: Cidr, note = ''): HistoryEntry {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    input: cidr.input,
    cidr: cidrToString(cidr),
    family: cidr.family,
    prefix: cidr.prefix,
    note,
    favorite: false,
    createdAt: Date.now(),
  };
}

export function addHistoryEntry(
  list: HistoryEntry[],
  entry: HistoryEntry,
  limit = HISTORY_LIMIT,
): HistoryEntry[] {
  // повторный ввод того же адреса поднимает существующую запись
  const withoutDupe = list.filter((item) => item.cidr !== entry.cidr);
  return [entry, ...withoutDupe].slice(0, limit);
}

export function removeHistoryEntry(list: HistoryEntry[], id: string): HistoryEntry[] {
  return list.filter((item) => item.id !== id);
}

export function toggleFavorite(list: HistoryEntry[], id: string): HistoryEntry[] {
  return list.map((item) => (item.id === id ? { ...item, favorite: !item.favorite } : item));
}

export function searchHistory(
  list: HistoryEntry[],
  query: string,
  onlyFavorites = false,
): HistoryEntry[] {
  const q = query.trim().toLowerCase();
  return list.filter((item) => {
    if (onlyFavorites && !item.favorite) return false;
    if (!q) return true;
    return (
      item.cidr.toLowerCase().includes(q) ||
      item.input.toLowerCase().includes(q) ||
      item.note.toLowerCase().includes(q)
    );
  });
}

export function formatHistoryDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (sameDay) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
