/**
 * IP-ядро: разбор и форматирование IPv4/IPv6, маски, классы,
 * классификация специальных диапазонов (IANA), обратный DNS, EUI-64.
 *
 * Все вычисления — на BigInt, поэтому IPv6 работает без потерь,
 * а IPv4 корректно переживает /0, /31 и /32.
 */

export type Family = 4 | 6;

export const MAX_V4 = (1n << 32n) - 1n;
export const MAX_V6 = (1n << 128n) - 1n;

export class IpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IpError';
  }
}

export function familyBits(family: Family): number {
  return family === 4 ? 32 : 128;
}

export function familyMax(family: Family): bigint {
  return family === 4 ? MAX_V4 : MAX_V6;
}

/* ------------------------------------------------------------------ */
/* Разбор                                                              */
/* ------------------------------------------------------------------ */

/** Строгий разбор IPv4 в 32-битное число. Ведущие нули запрещены. */
export function parseIPv4(text: string): bigint {
  const s = text.trim();
  if (!s) throw new IpError('Пустой IPv4-адрес');
  const parts = s.split('.');
  if (parts.length !== 4) throw new IpError('IPv4 должен состоять из четырёх октетов');
  let out = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) throw new IpError(`Некорректный октет «${part}»`);
    if (part.length > 1 && part[0] === '0') {
      throw new IpError(`Ведущий ноль в октете «${part}» недопустим (неоднозначность)`);
    }
    const value = Number(part);
    if (value > 255) throw new IpError(`Октет «${part}» больше 255`);
    out = (out << 8n) | BigInt(value);
  }
  return out;
}

/** Разбор IPv6 в 128-битное число. Поддерживает «::», зону и встроенный IPv4. */
export function parseIPv6(text: string): bigint {
  let s = text.trim().toLowerCase();
  if (!s) throw new IpError('Пустой IPv6-адрес');

  const zoneAt = s.indexOf('%');
  if (zoneAt >= 0) {
    if (zoneAt === s.length - 1) throw new IpError('Пустая зона после «%»');
    s = s.slice(0, zoneAt);
  }

  if (s === '::') return 0n;

  const halves = s.split('::');
  if (halves.length > 2) throw new IpError('В IPv6 допускается только одно «::»');
  const leftRaw = halves[0];
  const rightRaw = halves.length === 2 ? halves[1] : null;

  const toGroups = (chunk: string, allowV4Tail: boolean): string[] => {
    if (chunk === '') return [];
    const items = chunk.split(':');
    const groups: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item === '') throw new IpError('Пустая группа: проверьте расстановку «:»');
      if (item.includes('.')) {
        if (!allowV4Tail || i !== items.length - 1) {
          throw new IpError('Встроенный IPv4 допустим только в конце адреса');
        }
        const v4 = parseIPv4(item);
        groups.push(((v4 >> 16n) & 0xffffn).toString(16), (v4 & 0xffffn).toString(16));
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(item)) {
          throw new IpError(`Некорректная группа «${item}»: ожидается 1–4 hex-цифры`);
        }
        groups.push(item);
      }
    }
    return groups;
  };

  const left = toGroups(leftRaw, rightRaw === null);
  const right = rightRaw !== null ? toGroups(rightRaw, true) : [];
  const given = left.length + right.length;

  let all: string[];
  if (rightRaw === null) {
    if (given !== 8) throw new IpError(`IPv6 должен содержать 8 групп, найдено ${given}`);
    all = left;
  } else {
    if (given > 7) throw new IpError('«::» должно заменять хотя бы одну группу');
    all = [...left, ...new Array<string>(8 - given).fill('0'), ...right];
  }

  let value = 0n;
  for (const group of all) value = (value << 16n) | BigInt(parseInt(group, 16));
  return value;
}

/** Разбор адреса с автоматическим определением семейства. */
export function parseAddress(text: string): { family: Family; address: bigint } {
  const s = text.trim();
  if (!s) throw new IpError('Пустой адрес');
  if (s.includes(':')) return { family: 6, address: parseIPv6(s) };
  return { family: 4, address: parseIPv4(s) };
}

/* ------------------------------------------------------------------ */
/* Форматирование                                                      */
/* ------------------------------------------------------------------ */

export function formatIPv4(value: bigint): string {
  if (value < 0n || value > MAX_V4) throw new IpError('Значение вне диапазона IPv4');
  return [24n, 16n, 8n, 0n].map((shift) => String((value >> shift) & 255n)).join('.');
}

/** RFC 5952: нижний регистр, без ведущих нулей, сжатие самой длинной серии нулей. */
export function formatIPv6(value: bigint): string {
  if (value < 0n || value > MAX_V6) throw new IpError('Значение вне диапазона IPv6');
  const groups: string[] = [];
  for (let i = 7; i >= 0; i--) {
    groups.push(((value >> BigInt(i * 16)) & 0xffffn).toString(16));
  }

  let bestStart = -1;
  let bestLen = 0;
  let runStart = -1;
  let runLen = 0;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === '0') {
      if (runStart < 0) runStart = i;
      runLen++;
      if (runLen > bestLen) {
        bestLen = runLen;
        bestStart = runStart;
      }
    } else {
      runStart = -1;
      runLen = 0;
    }
  }

  if (bestLen < 2) return groups.join(':');
  const head = groups.slice(0, bestStart).join(':');
  const tail = groups.slice(bestStart + bestLen).join(':');
  return `${head}::${tail}`;
}

export function formatAddress(family: Family, value: bigint): string {
  return family === 4 ? formatIPv4(value) : formatIPv6(value);
}

/* ------------------------------------------------------------------ */
/* Маски и CIDR                                                        */
/* ------------------------------------------------------------------ */

export function maskV4FromPrefix(prefix: number): bigint {
  assertPrefix(prefix, 4);
  if (prefix === 0) return 0n;
  return (MAX_V4 << BigInt(32 - prefix)) & MAX_V4;
}

export function maskV6FromPrefix(prefix: number): bigint {
  assertPrefix(prefix, 6);
  if (prefix === 0) return 0n;
  return (MAX_V6 << BigInt(128 - prefix)) & MAX_V6;
}

export function maskFromPrefix(family: Family, prefix: number): bigint {
  return family === 4 ? maskV4FromPrefix(prefix) : maskV6FromPrefix(prefix);
}

export function assertPrefix(prefix: number, family: Family): void {
  const max = familyBits(family);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) {
    throw new IpError(`Префикс должен быть целым от 0 до ${max}`);
  }
}

/** Префикс из маски-адреса; маска обязана быть непрерывной. */
export function prefixFromMask(mask: bigint, family: Family): number {
  const max = familyMax(family);
  if (mask < 0n || mask > max) throw new IpError('Маска вне диапазона семейства');
  const inverted = ~mask & max;
  if ((inverted & (inverted + 1n)) !== 0n) {
    throw new IpError('Маска не непрерывна: сначала единицы, затем нули');
  }
  return familyBits(family) - bitLength(inverted);
}

export function bitLength(value: bigint): number {
  return value <= 0n ? 0 : value.toString(2).length;
}

/** Wildcard (обратная маска). */
export function wildcardFromPrefix(family: Family, prefix: number): bigint {
  return familyMax(family) & ~maskFromPrefix(family, prefix);
}

export interface Cidr {
  family: Family;
  /** Адрес в том виде, как его ввели (не обязательно сетевой). */
  address: bigint;
  prefix: number;
  /** Исходная строка — для истории. */
  input: string;
}

/**
 * Разбор «10.0.0.1/24», «10.0.0.1 255.255.255.0», «2001:db8::1/64»,
 * «10.0.0.1» (по умолчанию /32 или /128).
 */
export function parseCidr(input: string, defaultFamily?: Family): Cidr {
  const trimmed = input.trim();
  if (!trimmed) throw new IpError('Пустой адрес');

  let text = trimmed;
  let prefixToken: string | null = null;

  // вариант «адрес маска» через пробел
  const spaced = text.split(/\s+/);
  if (spaced.length > 2) throw new IpError('Ожидается «адрес/префикс» или «адрес маска»');
  if (spaced.length === 2) {
    text = spaced[0];
    prefixToken = spaced[1];
  }

  // вариант «адрес/префикс»
  const slash = text.indexOf('/');
  if (slash >= 0) {
    if (prefixToken !== null) throw new IpError('Префикс указан дважды');
    const after = text.slice(slash + 1);
    if (!after) throw new IpError('Пустой префикс после «/»');
    text = text.slice(0, slash);
    prefixToken = after;
  }

  const looksV6 = text.includes(':');
  const family: Family = looksV6 ? 6 : (defaultFamily ?? 4);
  const address = family === 6 ? parseIPv6(text) : parseIPv4(text);

  let prefix: number;
  if (prefixToken === null) {
    prefix = familyBits(family);
  } else if (prefixToken.includes('.') && family === 4) {
    prefix = prefixFromMask(parseIPv4(prefixToken), 4);
  } else if (prefixToken.includes(':') && family === 6) {
    prefix = prefixFromMask(parseIPv6(prefixToken), 6);
  } else if (prefixToken.includes('.') || prefixToken.includes(':')) {
    throw new IpError('Маска не соответствует семейству адреса');
  } else if (/^\d{1,3}$/.test(prefixToken)) {
    prefix = Number(prefixToken);
  } else {
    throw new IpError(`Некорректный префикс «${prefixToken}»`);
  }

  assertPrefix(prefix, family);
  return { family, address, prefix, input: trimmed };
}

export function cidrToString(
  block: { family: Family; address: bigint; prefix: number },
  networkForm = true,
): string {
  const address = networkForm ? networkOf(block.address, block.prefix, block.family) : block.address;
  return `${formatAddress(block.family, address)}/${block.prefix}`;
}

/* ------------------------------------------------------------------ */
/* Границы сети                                                        */
/* ------------------------------------------------------------------ */

export function networkOf(address: bigint, prefix: number, family: Family): bigint {
  return address & maskFromPrefix(family, prefix);
}

export function lastOf(network: bigint, prefix: number, family: Family): bigint {
  return network | wildcardFromPrefix(family, prefix);
}

export function totalCount(prefix: number, family: Family): bigint {
  return 1n << BigInt(familyBits(family) - prefix);
}

/**
 * Количество адресов, которые можно назначить хостам.
 * IPv4: /0…/30 — минус сеть и broadcast; /31 — 2 (RFC 3021); /32 — 1.
 * IPv6: broadcast отсутствует, доступны все адреса подсети.
 */
export function usableCount(prefix: number, family: Family): bigint {
  if (family === 6) return totalCount(prefix, 6);
  if (prefix >= 32) return 1n;
  if (prefix === 31) return 2n;
  return totalCount(prefix, 4) - 2n;
}

export function hostBits(prefix: number, family: Family): number {
  return familyBits(family) - prefix;
}

/* ------------------------------------------------------------------ */
/* Классы IPv4                                                         */
/* ------------------------------------------------------------------ */

export type V4Class = 'A' | 'B' | 'C' | 'D' | 'E';

export function classOfV4(address: bigint): V4Class {
  const first = Number((address >> 24n) & 255n);
  if (first <= 127) return 'A';
  if (first <= 191) return 'B';
  if (first <= 223) return 'C';
  if (first <= 239) return 'D';
  return 'E';
}

/** Классовая маска по умолчанию (для A/B/C), иначе null. */
export function classfulPrefix(address: bigint): number | null {
  switch (classOfV4(address)) {
    case 'A':
      return 8;
    case 'B':
      return 16;
    case 'C':
      return 24;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Специальные диапазоны (IANA) и классификация                        */
/* ------------------------------------------------------------------ */

export type AddressKind =
  | 'private'
  | 'loopback'
  | 'link-local'
  | 'multicast'
  | 'reserved'
  | 'documentation'
  | 'cgnat'
  | 'benchmark'
  | 'global'
  | 'ula'
  | 'unspecified'
  | 'mapped'
  | 'nat64'
  | 'transition'
  | 'broadcast';

export interface SpecialRange {
  family: Family;
  base: bigint;
  prefix: number;
  name: string;
  rfc: string;
  kind: AddressKind;
  /** Глобально маршрутизируемый диапазон. */
  global: boolean;
}

const SPECIAL_RANGES: SpecialRange[] = [];

function addRange(
  cidr: string,
  kind: AddressKind,
  name: string,
  rfc: string,
  global = false,
): void {
  const parsed = parseCidr(cidr);
  SPECIAL_RANGES.push({
    family: parsed.family,
    base: networkOf(parsed.address, parsed.prefix, parsed.family),
    prefix: parsed.prefix,
    name,
    rfc,
    kind,
    global,
  });
}

// IPv4
addRange('0.0.0.0/8', 'reserved', 'Эта сеть (this network)', 'RFC 791');
addRange('10.0.0.0/8', 'private', 'Private-Use', 'RFC 1918');
addRange('100.64.0.0/10', 'cgnat', 'Shared Address Space (CGNAT)', 'RFC 6598');
addRange('127.0.0.0/8', 'loopback', 'Loopback', 'RFC 1122');
addRange('169.254.0.0/16', 'link-local', 'Link Local', 'RFC 3927');
addRange('172.16.0.0/12', 'private', 'Private-Use', 'RFC 1918');
addRange('192.0.0.0/24', 'reserved', 'IETF Protocol Assignments', 'RFC 6890');
addRange('192.0.2.0/24', 'documentation', 'TEST-NET-1', 'RFC 5737');
addRange('192.31.196.0/24', 'reserved', 'AS112-v4', 'RFC 7535');
addRange('192.52.193.0/24', 'reserved', 'AMT', 'RFC 7450');
addRange('192.88.99.0/24', 'transition', '6to4 Relay Anycast (устарело)', 'RFC 7526');
addRange('192.168.0.0/16', 'private', 'Private-Use', 'RFC 1918');
addRange('192.175.48.0/24', 'reserved', 'Direct Delegation AS112', 'RFC 7534');
addRange('198.18.0.0/15', 'benchmark', 'Benchmarking', 'RFC 2544');
addRange('198.51.100.0/24', 'documentation', 'TEST-NET-2', 'RFC 5737');
addRange('203.0.113.0/24', 'documentation', 'TEST-NET-3', 'RFC 5737');
addRange('224.0.0.0/4', 'multicast', 'Multicast', 'RFC 5771');
addRange('240.0.0.0/4', 'reserved', 'Reserved (кроме broadcast)', 'RFC 1112');
addRange('255.255.255.255/32', 'broadcast', 'Limited Broadcast', 'RFC 919');

// IPv6
addRange('::/128', 'unspecified', 'Unspecified', 'RFC 4291');
addRange('::1/128', 'loopback', 'Loopback', 'RFC 4291');
addRange('::ffff:0:0/96', 'mapped', 'IPv4-mapped IPv6', 'RFC 4291');
addRange('64:ff9b::/96', 'nat64', 'NAT64 Well-Known Prefix', 'RFC 6052');
addRange('64:ff9b:1::/48', 'nat64', 'NAT64 Local-Use Prefix', 'RFC 8215');
addRange('100::/64', 'reserved', 'Discard-Only', 'RFC 6666');
addRange('2001::/32', 'transition', 'Teredo', 'RFC 4380');
addRange('2001:20::/28', 'reserved', 'ORCHIDv2', 'RFC 7343');
addRange('2001:db8::/32', 'documentation', 'Documentation', 'RFC 3849');
addRange('2002::/16', 'transition', '6to4', 'RFC 3056');
addRange('3fff::/20', 'documentation', 'Documentation', 'RFC 9637');
addRange('5f00::/16', 'reserved', 'Segment Routing SIDs', 'RFC 9602');
addRange('fc00::/7', 'ula', 'Unique Local', 'RFC 4193');
addRange('fe80::/10', 'link-local', 'Link Local', 'RFC 4291');
addRange('ff00::/8', 'multicast', 'Multicast', 'RFC 4291');
addRange('2000::/3', 'global', 'Global Unicast', 'RFC 4291', true);

export interface AddressInfo {
  family: Family;
  address: bigint;
  /** Самое специфичное совпадение из реестра IANA. */
  range: SpecialRange | null;
  /** Глобально маршрутизируемый адрес (публичный). */
  global: boolean;
  /** Локальный: private, CGNAT, loopback, link-local, ULA. */
  local: boolean;
  /** Человекочитаемая сводка. */
  label: string;
  rfc: string | null;
  kind: AddressKind;
  /** Для IPv4 — класс A–E. */
  v4Class: V4Class | null;
}

export function classifyAddress(address: bigint, family: Family): AddressInfo {
  const max = familyMax(family);
  if (address < 0n || address > max) throw new IpError('Адрес вне диапазона семейства');

  let best: SpecialRange | null = null;
  for (const range of SPECIAL_RANGES) {
    if (range.family !== family) continue;
    if ((address & maskFromPrefix(family, range.prefix)) !== range.base) continue;
    if (!best || range.prefix > best.prefix) best = range;
  }

  const local = best
    ? ['private', 'cgnat', 'loopback', 'link-local', 'ula'].includes(best.kind)
    : false;

  const global = best ? best.global : family === 4;

  return {
    family,
    address,
    range: best,
    global,
    local,
    label: best ? best.name : family === 4 ? 'Global Unicast' : 'Unassigned/Reserved',
    rfc: best?.rfc ?? null,
    kind: best?.kind ?? (family === 4 ? 'global' : 'reserved'),
    v4Class: family === 4 ? classOfV4(address) : null,
  };
}

/** Полный реестр — для справки в интерфейсе. */
export function specialRanges(): readonly SpecialRange[] {
  return SPECIAL_RANGES;
}

/* ------------------------------------------------------------------ */
/* Дополнительные утилиты                                              */
/* ------------------------------------------------------------------ */

/** Обратная зона DNS: 4.3.2.1.in-addr.arpa / nibble-форма для IPv6. */
export function reverseDns(address: bigint, family: Family): string {
  if (family === 4) {
    return `${formatIPv4(address).split('.').reverse().join('.')}.in-addr.arpa`;
  }
  const hex = address.toString(16).padStart(32, '0');
  return `${hex.split('').reverse().join('.')}.ip6.arpa`;
}

/** Link-local адрес EUI-64 из MAC-адреса. */
export function eui64LinkLocal(mac: string): string {
  const clean = mac.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length !== 12) throw new IpError('MAC должен содержать 12 hex-цифр');
  const bytes = clean.match(/.{2}/g)!.map((b) => parseInt(b, 16));
  bytes[0] ^= 0x02; // flip U/L bit
  const eui = [...bytes.slice(0, 3), 0xff, 0xfe, ...bytes.slice(3)];
  const groups: string[] = [];
  for (let i = 0; i < 4; i++) groups.push(((eui[i * 2] << 8) | eui[i * 2 + 1]).toString(16));
  return formatIPv6(parseIPv6(`fe80::${groups.join(':')}`));
}

/** Разложение на биты: строка из 0/1 длиной 32 или 128. */
export function toBitString(address: bigint, family: Family): string {
  const bits = familyBits(family);
  return address.toString(2).padStart(bits, '0').slice(-bits);
}

/** Сборка адреса из строки битов (позволяет кликать по битам в UI). */
export function fromBitString(bits: string, family: Family): bigint {
  const width = familyBits(family);
  const clean = bits.replace(/[^01]/g, '').padStart(width, '0').slice(-width);
  return BigInt(`0b${clean}`);
}

/** Группировка цифр неразрывными пробелами: 4294967294 → 4 294 967 294. */
export function groupDigits(value: bigint | number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

/** Компактная подпись степени двойки, если число — степень двойки. */
export function pow2Label(value: bigint): string | null {
  if (value <= 0n) return null;
  if ((value & (value - 1n)) !== 0n) return null;
  return `2^${bitLength(value) - 1}`;
}

/** Человекочитаемое количество адресов. */
export function humanCount(value: bigint): string {
  const pow = pow2Label(value);
  const grouped = groupDigits(value);
  if (value < 1_000_000n) return grouped;
  return pow ? `${grouped} (${pow})` : grouped;
}
