import { ru } from './ru';

export type Language = 'ru';

const dictionaries: Record<Language, Record<string, string>> = { ru };

let current: Language = 'ru';

export function setLanguage(lang: Language): void {
  current = lang;
}

export function getLanguage(): Language {
  return current;
}

/**
 * Перевод по ключу с подстановкой {параметров}.
 * Если ключа нет — возвращается сам ключ, чтобы пропуск сразу бросался в глаза.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = dictionaries[current][key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}
