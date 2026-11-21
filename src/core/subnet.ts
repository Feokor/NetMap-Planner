/**
 * Математика подсетей: границы блоков, разбиение, страницы хостов,
 * свободное пространство внутри суперсети.
 */

import {
  type Family,
  IpError,
  bitLength,
  familyBits,
  familyMax,
  formatAddress,
  lastOf,
  networkOf,
  usableCount,
} from './ip';

export interface Block {
  family: Family;
  /** Сетевой адрес блока. */
  address: bigint;
  prefix: number;
}

export function makeBlock(family: Family, address: bigint, prefix: number): Block {
  return { family, address: networkOf(address, prefix, family), prefix };
}

export function blockSize(prefix: number, family: Family): bigint {
  return 1n << BigInt(familyBits(family) - prefix);
}

export function blockSizeOf(block: Block): bigint {
  return blockSize(block.prefix, block.family);
}

export function blockLast(block: Block): bigint {
  return lastOf(block.address, block.prefix, block.family);
}

export function blockToString(block: Block): string {
  return `${formatAddress(block.family, block.address)}/${block.prefix}`;
}

export function blockContains(block: Block, address: bigint): boolean {
  return address >= block.address && address <= blockLast(block);
}

export function blocksOverlap(a: Block, b: Block): boolean {
  if (a.family !== b.family) return false;
  return a.address <= blockLast(b) && b.address <= blockLast(a);
}

export function blockContainsBlock(outer: Block, inner: Block): boolean {
  return (
    outer.family === inner.family &&
    inner.address >= outer.address &&
    blockLast(inner) <= blockLast(outer)
  );
}

/** Сколько подсетей указанного префикса помещается в блоке. */
export function subnetCount(block: Block, newPrefix: number): bigint {
  if (newPrefix < block.prefix) {
    throw new IpError(`Новый префикс /${newPrefix} больше исходного /${block.prefix}`);
  }
  return 1n << BigInt(newPrefix - block.prefix);
}

/**
 * Страница подсетей: не материализуем весь список, а считаем только запрошенный кусок.
 * Работает для IPv6 с /0 → /64 (2^64 подсетей) без переполнений.
 */
export function splitBlockPage(
  block: Block,
  newPrefix: number,
  offset: bigint,
  limit: number,
): Block[] {
  const count = subnetCount(block, newPrefix);
  if (offset < 0n || offset >= count) return [];
  const step = blockSize(newPrefix, block.family);
  const take = bigintMin(BigInt(limit), count - offset);
  const out: Block[] = [];
  for (let i = 0n; i < take; i++) {
    out.push({
      family: block.family,
      address: block.address + (offset + i) * step,
      prefix: newPrefix,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Деление на N подсетей                                               */
/* ------------------------------------------------------------------ */

export interface CountSplit {
  /** Префикс, на который нужно делить блок. */
  prefix: number;
  /** Фактическое число подсетей — всегда степень двойки. */
  count: bigint;
  /** Запрошенное число подсетей (не меньше единицы). */
  requested: bigint;
  /** true, если запрошено больше, чем помещается: префикс обрезан максимумом. */
  clipped: boolean;
}

/** Наименьшая степень двойки не меньше value (при value ≤ 1 → 1). */
export function pow2Ceil(value: bigint): bigint {
  return value <= 1n ? 1n : 1n << BigInt(bitLength(value - 1n));
}

function normalizeCount(requested: number | bigint): bigint {
  if (typeof requested === 'bigint') return requested < 1n ? 1n : requested;
  if (!Number.isFinite(requested)) return 1n;
  const value = Math.floor(requested);
  return value < 1 ? 1n : BigInt(value);
}

/**
 * План деления блока на N подсетей.
 * Количество округляется вверх до степени двойки, префикс растёт
 * на ceil(log2(N)) и обрезается максимальным для семейства:
 * /24 и N=5 → 8 подсетей, /27; /24 и N=1000 → 256 подсетей, /32 (clipped).
 */
export function planSubnetSplit(block: Block, requested: number | bigint): CountSplit {
  const wanted = normalizeCount(requested);
  const target = pow2Ceil(wanted);
  const maxCount = 1n << BigInt(familyBits(block.family) - block.prefix);
  const count = target > maxCount ? maxCount : target;
  return {
    prefix: block.prefix + (bitLength(count) - 1),
    count,
    requested: wanted,
    clipped: count < target,
  };
}

/** Префикс для деления блока на N подсетей (пример: /24 и N=5 → /27). */
export function prefixForSubnetCount(block: Block, requested: number | bigint): number {
  return planSubnetSplit(block, requested).prefix;
}

/** Реальное число подсетей при делении на N (степень двойки, с обрезкой максимумом). */
export function subnetCountForRequest(block: Block, requested: number | bigint): bigint {
  return planSubnetSplit(block, requested).count;
}

export type HostRole = 'network' | 'broadcast' | 'host' | 'anycast' | 'single' | 'point-to-point';

export interface HostRow {
  /** Порядковый номер внутри блока (учитывая сетевой адрес). */
  index: bigint;
  address: bigint;
  role: HostRole;
  /** Можно ли назначить на устройство. */
  usable: boolean;
}

/**
 * Тип адреса по его позиции в блоке.
 * IPv4: /31 — обе точки (RFC 3021), /32 — единственный адрес.
 * IPv6: broadcast нет, первый адрес — subnet-router anycast.
 */
export function hostRoleAt(block: Block, index: bigint): { role: HostRole; usable: boolean } {
  const total = blockSizeOf(block);
  const ipv4 = block.family === 4;

  if (total === 1n) return { role: 'single', usable: true };
  if (ipv4 && block.prefix === 31) return { role: 'point-to-point', usable: true };
  if (ipv4 && block.prefix <= 30) {
    if (index === 0n) return { role: 'network', usable: false };
    if (index === total - 1n) return { role: 'broadcast', usable: false };
    return { role: 'host', usable: true };
  }
  // IPv6
  if (index === 0n) return { role: 'anycast', usable: false };
  return { role: 'host', usable: true };
}

export function hostsPage(block: Block, offset: bigint, limit: number): HostRow[] {
  const total = blockSizeOf(block);
  if (offset < 0n || offset >= total) return [];
  const take = bigintMin(BigInt(limit), total - offset);
  const out: HostRow[] = [];
  for (let i = 0n; i < take; i++) {
    const index = offset + i;
    const { role, usable } = hostRoleAt(block, index);
    out.push({ index, address: block.address + index, role, usable });
  }
  return out;
}

/** Первый и последний назначаемый адрес. */
export function usableRange(block: Block): { first: bigint; last: bigint } | null {
  const total = blockSizeOf(block);
  if (usableCount(block.prefix, block.family) === 0n) return null;
  const firstIndex = hostRoleAt(block, 0n).usable ? 0n : 1n;
  const lastIndex = hostRoleAt(block, total - 1n).usable ? total - 1n : total - 2n;
  if (lastIndex < firstIndex) return null;
  return { first: block.address + firstIndex, last: block.address + lastIndex };
}

/* ------------------------------------------------------------------ */
/* Свободное пространство                                              */
/* ------------------------------------------------------------------ */

function trailingZeros(value: bigint): number {
  if (value === 0n) return 0;
  let count = 0;
  let v = value;
  while ((v & 1n) === 0n) {
    v >>= 1n;
    count++;
  }
  return count;
}

export function bitFloor(value: bigint): number {
  return bitLength(value) - 1;
}

/** Разбиение непрерывного диапазона на минимальный набор CIDR-блоков. */
export function rangeToCidrs(family: Family, start: bigint, end: bigint): Block[] {
  if (start > end) return [];
  const bits = familyBits(family);
  const max = familyMax(family);
  if (start < 0n || end > max) throw new IpError('Диапазон вне семейства адресов');

  const out: Block[] = [];
  let current = start;
  while (current <= end) {
    const align = current === 0n ? bits : Math.min(trailingZeros(current), bits);
    const remainingBits = bitFloor(end - current + 1n);
    const sizeBits = Math.min(align, remainingBits);
    out.push({ family, address: current, prefix: bits - sizeBits });
    current += 1n << BigInt(sizeBits);
    if (out.length > 200_000) throw new IpError('Слишком много фрагментов: уточните диапазон');
  }
  return out;
}

/** Свободные CIDR-блоки внутри суперсети с учётом занятых. */
export function freeBlocks(superblock: Block, used: Block[]): Block[] {
  const last = blockLast(superblock);
  const spans: Array<{ start: bigint; end: bigint }> = [];

  for (const item of used) {
    if (item.family !== superblock.family) continue;
    const start = bigintMax(item.address, superblock.address);
    const end = bigintMin(blockLast(item), last);
    if (start <= end) spans.push({ start, end });
  }

  spans.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const merged: Array<{ start: bigint; end: bigint }> = [];
  for (const span of spans) {
    const prev = merged[merged.length - 1];
    if (prev && span.start <= prev.end + 1n) {
      if (span.end > prev.end) prev.end = span.end;
    } else {
      merged.push({ ...span });
    }
  }

  const out: Block[] = [];
  let cursor = superblock.address;
  for (const span of merged) {
    if (span.start > cursor) {
      out.push(...rangeToCidrs(superblock.family, cursor, span.start - 1n));
    }
    cursor = bigintMax(cursor, span.end + 1n);
  }
  if (cursor <= last) out.push(...rangeToCidrs(superblock.family, cursor, last));
  return out;
}

function alignUp(value: bigint, size: bigint): bigint {
  const rem = value % size;
  return rem === 0n ? value : value + (size - rem);
}

/** Первый свободный блок нужного префикса (выравнивание по размеру). */
export function firstFreeBlock(
  superblock: Block,
  used: Block[],
  desiredPrefix: number,
): Block | null {
  if (desiredPrefix < superblock.prefix) {
    throw new IpError(`Искомый префикс /${desiredPrefix} больше суперсети /${superblock.prefix}`);
  }
  const size = blockSize(desiredPrefix, superblock.family);
  for (const free of freeBlocks(superblock, used)) {
    if (free.prefix > desiredPrefix) continue;
    const candidate = alignUp(free.address, size);
    const freeLast = blockLast(free);
    if (candidate + size - 1n <= freeLast) {
      return { family: superblock.family, address: candidate, prefix: desiredPrefix };
    }
  }
  return null;
}

/** Суммарная ёмкость списка блоков. */
export function totalCapacity(blocks: Block[]): bigint {
  let sum = 0n;
  for (const block of blocks) sum += blockSizeOf(block);
  return sum;
}

function bigintMin(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function bigintMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}
