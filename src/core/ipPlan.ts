/**
 * План адресов проекта: занятость блоков, свободные диапазоны,
 * выдача следующего свободного адреса.
 */

import {
  formatAddress,
  humanCount,
  parseCidr,
  type Family,
} from './ip';
import {
  type Block,
  blockLast,
  blockSizeOf,
  freeBlocks,
  makeBlock,
  usableRange,
} from './subnet';
import {
  type IpBlock,
  type IpRef,
  type ProjectDocument,
  projectIps,
  uid,
} from './project';

export interface BlockUsage {
  item: IpBlock;
  block: Block;
  assigned: IpRef[];
  /** Уникальные занятые адреса. */
  used: bigint;
  /** Назначаемая ёмкость блока. */
  usable: bigint;
  /** Доля занятого в процентах (0–100). */
  percent: number;
  /** Свободные CIDR-диапазоны (для детального просмотра). */
  free: Block[];
}

export function parseIpBlock(item: IpBlock): Block | null {
  try {
    const parsed = parseCidr(item.cidr);
    return makeBlock(parsed.family, parsed.address, parsed.prefix);
  } catch {
    return null;
  }
}

export function blockUsage(doc: ProjectDocument, item: IpBlock, withFree = true): BlockUsage | null {
  const block = parseIpBlock(item);
  if (!block) return null;

  const ips = projectIps(doc);
  const last = blockLast(block);
  const seen = new Set<string>();
  const assigned: IpRef[] = [];

  for (const ref of ips) {
    if (ref.role === 'dhcp') continue; // DHCP-пул — не занятый адрес хоста
    if (ref.family !== block.family) continue;
    if (ref.address < block.address || ref.address > last) continue;
    const key = ref.address.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    assigned.push(ref);
  }
  assigned.sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));

  const used = BigInt(assigned.length);
  const capacity = usableRange(block);
  const usable = capacity ? capacity.last - capacity.first + 1n : 0n;
  const percent = usable === 0n ? 0 : Math.min(100, (Number(used) / Number(usable)) * 100);

  let free: Block[] = [];
  if (withFree) {
    const usedBlocks: Block[] = assigned.map((ref) => ({
      family: ref.family,
      address: ref.address,
      prefix: ref.family === 4 ? 32 : 128,
    }));
    // сеть и broadcast не считаются занятыми адресами, но и не свободны для хостов
    if (capacity) {
      if (capacity.first > block.address) {
        usedBlocks.push({
          family: block.family,
          address: block.address,
          prefix: block.family === 4 ? 32 : 128,
        });
      }
      if (capacity.last < last) {
        usedBlocks.push({ family: block.family, address: last, prefix: block.family === 4 ? 32 : 128 });
      }
      free = freeBlocks(block, usedBlocks);
    }
  }

  return { item, block, assigned, used, usable, percent, free };
}

export interface PlanOverview {
  blocks: BlockUsage[];
  totals: {
    blocks: number;
    capacity: bigint;
    usable: bigint;
    used: bigint;
    percent: number;
    unplanned: number;
  };
}

export function planOverview(doc: ProjectDocument): PlanOverview {
  const blocks = doc.ipPlan.blocks
    .map((item) => blockUsage(doc, item, false))
    .filter((usage): usage is BlockUsage => usage !== null);

  let capacity = 0n;
  let usable = 0n;
  let used = 0n;
  for (const usage of blocks) {
    capacity += blockSizeOf(usage.block);
    usable += usage.usable;
    used += usage.used;
  }

  const planned = new Set<string>();
  for (const usage of blocks) {
    for (const ref of usage.assigned) planned.add(`${ref.family}:${ref.address.toString()}`);
  }
  const unplanned = projectIps(doc).filter(
    (ref) => ref.role !== 'dhcp' && !planned.has(`${ref.family}:${ref.address.toString()}`),
  ).length;

  return {
    blocks,
    totals: {
      blocks: blocks.length,
      capacity,
      usable,
      used,
      percent: usable === 0n ? 0 : Math.min(100, (Number(used) / Number(usable)) * 100),
      unplanned,
    },
  };
}

export interface FreeAddress {
  block: IpBlock;
  family: Family;
  address: string;
  prefix: number;
  /** Для IPv6 — количество доступных адресов в блоке. */
  candidates: bigint;
}

/**
 * Первый свободный адрес в блоке: идём по занятым адресам, а не по всему диапазону,
 * поэтому IPv6 /64 не превращается в бесконечный цикл.
 */
export function nextFreeInBlock(doc: ProjectDocument, item: IpBlock): FreeAddress | null {
  const block = parseIpBlock(item);
  if (!block) return null;
  const range = usableRange(block);
  if (!range) return null;

  const used = new Set<string>();
  for (const ref of projectIps(doc)) {
    if (ref.role === 'dhcp') continue;
    if (ref.family !== block.family) continue;
    if (ref.address < range.first || ref.address > range.last) continue;
    used.add(ref.address.toString());
  }

  let candidate = range.first;
  const sorted = [...used]
    .map((value) => BigInt(value))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  for (const address of sorted) {
    if (address < candidate) continue;
    if (address === candidate) {
      candidate += 1n;
      continue;
    }
    break;
  }
  if (candidate > range.last) return null;

  return {
    block: item,
    family: block.family,
    address: formatAddress(block.family, candidate),
    prefix: block.prefix,
    candidates: range.last - candidate + 1n,
  };
}

export function nextFreeAnywhere(doc: ProjectDocument): FreeAddress | null {
  for (const item of doc.ipPlan.blocks) {
    const free = nextFreeInBlock(doc, item);
    if (free) return free;
  }
  return null;
}

export function addIpBlock(
  doc: ProjectDocument,
  cidr: string,
  name: string,
  extra: Partial<IpBlock> = {},
): ProjectDocument {
  const item: IpBlock = { id: uid('blk'), cidr: cidr.trim(), name: name.trim() || cidr.trim(), ...extra };
  return {
    ...doc,
    ipPlan: { ...doc.ipPlan, blocks: [...doc.ipPlan.blocks, item] },
    updatedAt: Date.now(),
  };
}

export function formatOccupancy(used: bigint, usable: bigint): string {
  if (usable === 0n) return '0';
  return `${humanCount(used)} из ${humanCount(usable)}`;
}
