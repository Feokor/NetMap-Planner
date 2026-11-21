/**
 * Импорт устройств из CSV — обратная операция к экспорту таблицы устройств.
 * Понимает `;` и `,`, кавычки с удвоением, заголовки на английском и русском.
 */

import {
  DEVICE_KINDS,
  DEVICE_LAYERS,
  createDevice,
  createGroup,
  createIpAssignment,
  createPort,
  createProject,
  type Device,
  type DeviceKind,
  type DeviceLayer,
  type Group,
  type ProjectDocument,
} from './project';
import { parseAddress } from './ip';

const HEADER_ALIASES: Record<string, string> = {
  name: 'name',
  имя: 'name',
  устройство: 'name',
  kind: 'kind',
  тип: 'kind',
  layer: 'layer',
  слой: 'layer',
  group: 'group',
  группа: 'group',
  os: 'os',
  ос: 'os',
  role: 'role',
  роль: 'role',
  vendor: 'vendor',
  вендор: 'vendor',
  производитель: 'vendor',
  model: 'model',
  модель: 'model',
  location: 'location',
  расположение: 'location',
  место: 'location',
  serial: 'serial',
  серийный: 'serial',
  'серийный номер': 'serial',
  ports: 'ports',
  порты: 'ports',
  ips: 'ips',
  ip: 'ips',
  адреса: 'ips',
  tags: 'tags',
  теги: 'tags',
};

const KIND_ALIASES: Record<string, DeviceKind> = {
  пк: 'pc',
  компьютер: 'pc',
  роутер: 'router',
  маршрутизатор: 'router',
  коммутатор: 'switch',
  свитч: 'switch',
  фаервол: 'firewall',
  файрвол: 'firewall',
  сервер: 'server',
  ноутбук: 'laptop',
  телефон: 'phone',
  смартфон: 'phone',
  принтер: 'printer',
  камера: 'camera',
  'точка доступа': 'ap',
  ибп: 'ups',
  облако: 'cloud',
  хранилище: 'nas',
};

const DEFAULT_ORDER = [
  'name',
  'kind',
  'layer',
  'group',
  'os',
  'role',
  'vendor',
  'model',
  'location',
  'serial',
  'ports',
  'ips',
  'tags',
];

export interface CsvProjectResult {
  doc: ProjectDocument;
  devices: number;
  groups: number;
}

/** Разбирает CSV с учётом кавычек, удвоенных кавычек и переводов строк в полях. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const sep = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const char = src[i];
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === sep) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => cell.trim() !== ''));
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return firstLine.includes(';') ? ';' : ',';
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function knownKind(value: string): DeviceKind {
  const normalized = value.trim().toLowerCase();
  if (KIND_ALIASES[normalized]) return KIND_ALIASES[normalized];
  const kind = normalized as DeviceKind;
  return DEVICE_KINDS.includes(kind) ? kind : 'other';
}

function knownLayer(value: string): DeviceLayer {
  const layer = value.trim().toUpperCase() as DeviceLayer;
  return DEVICE_LAYERS.includes(layer) ? layer : 'L3';
}

function splitList(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function portsWithIps(countText: string, ipsText: string) {
  const count = Math.max(1, Math.min(64, Number.parseInt(countText, 10) || 1));
  const ports = Array.from({ length: count }, (_, index) => createPort({ name: `eth${index}` }));
  const ips = splitList(ipsText)
    .map((item) => {
      const [address, prefixText] = item.split('/');
      try {
        const parsed = parseAddress(address);
        const max = parsed.family === 6 ? 128 : 32;
        const parsedPrefix = Number.parseInt(prefixText ?? '', 10);
        const prefix = Number.isFinite(parsedPrefix)
          ? Math.min(max, Math.max(0, parsedPrefix))
          : max;
        return createIpAssignment(address, prefix);
      } catch {
        return null;
      }
    })
    .filter((ip): ip is ReturnType<typeof createIpAssignment> => ip != null);
  ips.forEach((ip, index) => {
    const port = ports[Math.min(index, ports.length - 1)];
    port.ips.push(ip);
  });
  return ports;
}

export function csvToProject(text: string, projectName = 'Импорт CSV'): CsvProjectResult {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('CSV пуст');

  const header = rows[0].map((cell) => HEADER_ALIASES[normalizeKey(cell)] ?? '');
  const hasHeader = header.includes('name');
  const order = hasHeader ? header : DEFAULT_ORDER;
  const data = hasHeader ? rows.slice(1) : rows;

  const field = (row: string[], key: string): string => {
    const index = order.indexOf(key);
    return index >= 0 ? (row[index] ?? '').trim() : '';
  };

  const groups = new Map<string, Group>();
  const devices: Device[] = [];
  data.forEach((row, index) => {
    const name = field(row, 'name') || `device-${index + 1}`;
    const groupName = field(row, 'group');
    let groupId: string | null = null;
    if (groupName) {
      let group = groups.get(groupName);
      if (!group) {
        group = createGroup(groupName);
        groups.set(groupName, group);
      }
      groupId = group.id;
    }
    devices.push(
      createDevice({
        name,
        kind: knownKind(field(row, 'kind')),
        attrs: {
          layer: knownLayer(field(row, 'layer')),
          os: field(row, 'os'),
          role: field(row, 'role'),
          vendor: field(row, 'vendor'),
          model: field(row, 'model'),
          location: field(row, 'location'),
          serial: field(row, 'serial'),
        },
        tags: splitList(field(row, 'tags')),
        groupId,
        groupIds: groupId ? [groupId] : [],
        ports: portsWithIps(field(row, 'ports'), field(row, 'ips')),
        canvas: {
          x: (index % 4) * (176 + 56),
          y: Math.floor(index / 4) * (78 + 56),
        },
      }),
    );
  });

  if (devices.length === 0) throw new Error('В CSV нет строк с устройствами');

  const base = createProject(projectName);
  return {
    doc: {
      ...base,
      devices,
      groups: [...groups.values()],
    },
    devices: devices.length,
    groups: groups.size,
  };
}
