/**
 * DNS-зоны проекта: FQDN устройств, автоматические A/AAAA/PTR,
 * обратные зоны с выбором глубины и экспорт BIND.
 */

import type { Device, DnsZone, ProjectDocument } from './project';
import { defaultDns } from './project';
import { parseAddress } from './ip';

export interface ForwardRecord {
  zone: string;
  name: string;
  type: 'A' | 'AAAA';
  value: string;
  deviceId: string;
  deviceName: string;
}

export interface ReverseRecord {
  /** Полное имя PTR-записи (1.7.168.192.in-addr.arpa). */
  name: string;
  /** Относительное имя внутри зоны: 1, 1.7 и т.п. */
  owner: string;
  value: string;
  deviceId: string;
  deviceName: string;
}

export interface ReverseZone {
  name: string;
  records: ReverseRecord[];
}

export interface DnsRecords {
  forward: ForwardRecord[];
  reverse: ReverseZone[];
  /** Сколько октетов реально использовано в обратных зонах. */
  depth: number;
}

export function dnsState(doc: ProjectDocument) {
  return doc.dns ?? defaultDns();
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Имя хоста: нижний регистр, транслит кириллицы, пробелы → дефис. */
export function normalizeDnsName(value: string): string {
  const transliterated = [...value.toLowerCase()]
    .map((char) => TRANSLIT[char] ?? char)
    .join('');
  const cleaned = transliterated
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9.-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '');
  return cleaned;
}

export function defaultDnsName(device: Device): string {
  const normalized = normalizeDnsName(device.name);
  if (normalized) return normalized;
  const suffix = device.id.replace(/[^a-z0-9]/gi, '').slice(-4).toLowerCase();
  return suffix ? `host-${suffix}` : 'host';
}

/** Имя зоны: punycode для кириллицы, без ведущей/хвостовой точки. */
export function normalizeZoneName(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const host = new URL(`http://${trimmed.replace(/^\.+|\.+$/g, '')}`).hostname;
    if (!host || host.includes(' ') || !host.includes('.')) return null;
    return host;
  } catch {
    return null;
  }
}

export function zoneForDevice(doc: ProjectDocument, device: Device): DnsZone | null {
  const zones = dnsState(doc).zones;
  if (device.dnsZoneId) {
    const explicit = zones.find((zone) => zone.id === device.dnsZoneId);
    if (explicit) return explicit;
  }
  return zones.find((zone) => zone.default) ?? null;
}

export function deviceFqdn(doc: ProjectDocument, device: Device): string | null {
  const zone = zoneForDevice(doc, device);
  if (!zone) return null;
  const name = normalizeDnsName(device.dnsName ?? '') || defaultDnsName(device);
  return `${name}.${zone.name}`;
}

function ipv4Octets(address: string): number[] | null {
  try {
    const parsed = parseAddress(address);
    if (parsed.family !== 4) return null;
    return [
      Number((parsed.address >> 24n) & 0xffn),
      Number((parsed.address >> 16n) & 0xffn),
      Number((parsed.address >> 8n) & 0xffn),
      Number(parsed.address & 0xffn),
    ];
  } catch {
    return null;
  }
}

/** Сколько первых октетов совпадает у всех адресов. */
export function commonPrefixOctets(addresses: string[]): number {
  const octets = addresses.map(ipv4Octets).filter((item): item is number[] => item !== null);
  if (octets.length === 0) return 0;
  let common = 4;
  for (const item of octets) {
    for (let index = 0; index < 4; index++) {
      if (item[index] !== octets[0][index]) {
        common = Math.min(common, index);
        break;
      }
    }
  }
  return Math.min(common, 4);
}

function pickDepth(doc: ProjectDocument, addresses: string[]): number {
  const settings = dnsState(doc).settings;
  if (settings.reverseMode === 'manual') {
    return Math.min(4, Math.max(1, Math.round(settings.reverseDepth)));
  }
  return Math.min(3, Math.max(1, commonPrefixOctets(addresses)));
}

/** Автоматические записи проекта: A/AAAA и PTR. */
export function dnsRecords(doc: ProjectDocument): DnsRecords {
  const forward: ForwardRecord[] = [];
  const ipv4Addresses: string[] = [];
  const seen = new Set<string>();

  for (const device of doc.devices) {
    const zone = zoneForDevice(doc, device);
    if (!zone) continue;
    const name = normalizeDnsName(device.dnsName ?? '') || defaultDnsName(device);
    for (const port of device.ports) {
      for (const ip of port.ips) {
        if (ip.role === 'dhcp') continue;
        if (!ip.address.trim()) continue;
        try {
          const parsed = parseAddress(ip.address);
          const type = parsed.family === 4 ? 'A' : 'AAAA';
          const key = `${zone.name}|${name}|${type}|${ip.address}`;
          if (seen.has(key)) continue;
          seen.add(key);
          forward.push({
            zone: zone.name,
            name,
            type,
            value: ip.address,
            deviceId: device.id,
            deviceName: device.name,
          });
          if (parsed.family === 4) ipv4Addresses.push(ip.address);
        } catch {
          /* некорректный адрес уже виден в проверке */
        }
      }
    }
  }

  forward.sort((a, b) =>
    a.zone.localeCompare(b.zone) || a.name.localeCompare(b.name) || a.value.localeCompare(b.value),
  );

  const depth = pickDepth(doc, ipv4Addresses);
  const zones = new Map<string, ReverseZone>();
  const reverseSeen = new Set<string>();
  for (const record of forward) {
    if (record.type !== 'A') continue;
    const octets = ipv4Octets(record.value);
    if (!octets) continue;
    const zoneOctets = octets.slice(0, depth).reverse();
    const ownerOctets = octets.slice(depth).reverse();
    const zoneName = `${zoneOctets.join('.')}.in-addr.arpa`;
    const owner = ownerOctets.length > 0 ? ownerOctets.join('.') : '@';
    const key = `${zoneName}|${owner}|${record.name}.${record.zone}`;
    if (reverseSeen.has(key)) continue;
    reverseSeen.add(key);
    let zone = zones.get(zoneName);
    if (!zone) {
      zone = { name: zoneName, records: [] };
      zones.set(zoneName, zone);
    }
    zone.records.push({
      name: owner === '@' ? zoneName : `${owner}.${zoneName}`,
      owner,
      value: `${record.name}.${record.zone}`,
      deviceId: record.deviceId,
      deviceName: record.deviceName,
    });
  }

  const reverse = [...zones.values()]
    .map((zone) => ({
      ...zone,
      records: [...zone.records].sort((a, b) => a.owner.localeCompare(b.owner, 'en', { numeric: true })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { forward, reverse, depth };
}

function serial(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}01`;
}

function zoneHeader(zone: string, ttl: number): string[] {
  return [
    `; === ${zone} ===`,
    '$TTL ' + ttl,
    `$ORIGIN ${zone}.`,
    '@ IN SOA ns.' + zone + '. hostmaster.' + zone + '. (',
    `  ${serial()} ; serial`,
    '  3600       ; refresh',
    '  900        ; retry',
    '  1209600    ; expire',
    '  300 )      ; minimum',
    '@ IN NS ns.' + zone + '.',
  ];
}

/** Один TXT с секциями прямых и обратных зон в синтаксисе BIND. */
export function exportBind(doc: ProjectDocument): string {
  const settings = dnsState(doc).settings;
  const records = dnsRecords(doc);
  const zones = dnsState(doc).zones;
  const lines: string[] = [
    `; NetMap Planner — DNS export`,
    `; project: ${doc.name}`,
    `; generated: ${new Date().toISOString()}`,
    '',
  ];

  for (const zone of zones) {
    lines.push(...zoneHeader(zone.name, settings.ttl));
    const zoneRecords = records.forward.filter((record) => record.zone === zone.name);
    if (zoneRecords.length === 0) {
      lines.push('; записей нет');
    } else {
      for (const record of zoneRecords) {
        lines.push(`${record.name} IN ${record.type} ${record.value}`);
      }
    }
    lines.push('');
  }

  for (const zone of records.reverse) {
    lines.push(...zoneHeader(zone.name, settings.ttl));
    for (const record of zone.records) {
      lines.push(`${record.owner} IN PTR ${record.value}.`);
    }
    lines.push('');
  }

  if (zones.length === 0) {
    lines.push('; в проекте нет DNS-зон — добавьте их в панели DNS');
  }

  return lines.join('\n');
}
