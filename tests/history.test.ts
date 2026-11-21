import { describe, expect, it } from 'vitest';
import {
  addHistoryEntry,
  makeHistoryEntry,
  removeHistoryEntry,
  searchHistory,
  toggleFavorite,
  type HistoryEntry,
} from '../src/core/history';
import { parseCidr } from '../src/core/ip';

const entry = (input: string, createdAt = Date.now(), note = ''): HistoryEntry => ({
  ...makeHistoryEntry(parseCidr(input), note),
  createdAt,
});

describe('история', () => {
  it('нормализует запись к сетевому адресу', () => {
    const item = makeHistoryEntry(parseCidr('10.1.2.3/24'));
    expect(item.cidr).toBe('10.1.2.0/24');
    expect(item.input).toBe('10.1.2.3/24');
    expect(item.family).toBe(4);
    expect(item.prefix).toBe(24);
    expect(item.favorite).toBe(false);
  });

  it('добавляет новые записи сверху и убирает дубликаты', () => {
    const first = entry('10.0.0.0/24', 1);
    const second = entry('192.168.0.0/16', 2);
    const list = addHistoryEntry(addHistoryEntry([], first), second);
    expect(list.map((item) => item.cidr)).toEqual(['192.168.0.0/16', '10.0.0.0/24']);

    const repeat = { ...entry('10.0.0.5/24', 3), id: 'repeat' };
    const updated = addHistoryEntry(list, repeat);
    expect(updated[0].id).toBe('repeat');
    expect(updated).toHaveLength(2);
  });

  it('ограничивает размер истории', () => {
    let list: HistoryEntry[] = [];
    for (let i = 0; i < 5; i++) list = addHistoryEntry(list, entry(`10.0.${i}.0/24`, i), 3);
    expect(list).toHaveLength(3);
    expect(list[0].cidr).toBe('10.0.4.0/24');
  });

  it('удаляет и переключает избранное', () => {
    const list = [entry('10.0.0.0/24', 1), entry('10.0.1.0/24', 2)];
    const starred = toggleFavorite(list, list[1].id);
    expect(starred[1].favorite).toBe(true);
    expect(toggleFavorite(starred, list[1].id)[1].favorite).toBe(false);
    expect(removeHistoryEntry(list, list[0].id).map((item) => item.cidr)).toEqual(['10.0.1.0/24']);
  });

  it('ищет по адресу, вводу и заметке', () => {
    const list = [
      entry('10.0.0.0/8', 1, 'датацентр'),
      { ...entry('2001:db8::/32', 2), input: '2001:DB8::/32' },
      entry('192.168.0.0/16', 3),
    ];
    expect(searchHistory(list, '10.')).toHaveLength(1);
    expect(searchHistory(list, 'db8')).toHaveLength(1);
    expect(searchHistory(list, 'ДАТАЦЕНТР')).toHaveLength(1);
    expect(searchHistory(list, '')).toHaveLength(3);

    const favorites = toggleFavorite(list, list[2].id);
    expect(searchHistory(favorites, '', true)).toHaveLength(1);
  });
});
