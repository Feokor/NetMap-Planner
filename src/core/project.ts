/**
 * Модель проекта: устройства, порты, IP, группы, связи, слои и план адресов.
 *
 * Документ сериализуется в один JSON-файл. Все поля, кроме геометрии,
 * используются и в режиме списка, и на холсте.
 */

import {
  formatAddress,
  type Family,
  IpError,
  parseAddress,
  parseCidr,
  parseIPv4,
  parseIPv6,
} from './ip';

export const SCHEMA = 'netmap/v1';

export type DeviceKind =
  | 'router'
  | 'switch'
  | 'firewall'
  | 'server'
  | 'pc'
  | 'laptop'
  | 'phone'
  | 'printer'
  | 'camera'
  | 'ap'
  | 'nas'
  | 'ups'
  | 'cloud'
  | 'other';

export const DEVICE_KINDS: DeviceKind[] = [
  'router',
  'switch',
  'firewall',
  'server',
  'pc',
  'laptop',
  'phone',
  'printer',
  'camera',
  'ap',
  'nas',
  'ups',
  'cloud',
  'other',
];

export type DeviceLayer = 'L1' | 'L2' | 'L3';
export const DEVICE_LAYERS: DeviceLayer[] = ['L1', 'L2', 'L3'];

export type PortMedia = 'copper' | 'fiber' | 'wireless' | 'virtual' | 'console';
export const PORT_MEDIA: PortMedia[] = ['copper', 'fiber', 'wireless', 'virtual', 'console'];

export type PortMode = 'access' | 'trunk' | 'routed' | 'unused';
export const PORT_MODES: PortMode[] = ['access', 'trunk', 'routed', 'unused'];

/** Физический порт или логический (мост, бонд, VLAN). */
export type PortKind = 'physical' | 'bridge' | 'bond' | 'vlan';
export const PORT_KINDS: PortKind[] = ['physical', 'bridge', 'bond', 'vlan'];

export type IpRole = 'static' | 'dhcp' | 'slaac' | 'reserved' | 'vip' | 'secondary';
export const IP_ROLES: IpRole[] = ['static', 'dhcp', 'slaac', 'reserved', 'vip', 'secondary'];

export interface IpAssignment {
  id: string;
  family: Family;
  /** Адрес в текстовом виде — так JSON остаётся читаемым и переносимым. */
  address: string;
  prefix: number;
  role: IpRole;
  note?: string;
  /** Роль DHCP: начало и конец диапазона выдачи (включительно). Пусто — весь пул. */
  poolFrom?: string;
  poolTo?: string;
}

export interface Port {
  id: string;
  name: string;
  media: PortMedia;
  speed?: string;
  mode: PortMode;
  vlan?: number | null;
  mac?: string;
  description?: string;
  ips: IpAssignment[];
  /** Тип порта; отсутствует — обычный физический порт. */
  kind?: PortKind;
  /** Для моста/бонда/VLAN — id портов-участников. */
  members?: string[];
}

export interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  attrs: {
    layer?: DeviceLayer;
    os?: string;
    role?: string;
    vendor?: string;
    model?: string;
    location?: string;
    serial?: string;
    note?: string;
  };
  tags: string[];
  /** Основная группа (для совместимости и быстрых фильтров). */
  groupId?: string | null;
  /** Дополнительные группы: устройство может входить в несколько. */
  groupIds?: string[];
  ports: Port[];
  /** Геометрия холста; отсутствует у устройств, добавленных только в список. */
  canvas?: {
    x: number;
    y: number;
    width?: number;
    height?: number;
    layerId?: string;
  };
}

export interface Group {
  id: string;
  name: string;
  color?: string;
  parentId?: string | null;
  collapsed?: boolean;
}

export type LinkMedia = 'copper' | 'fiber' | 'wireless' | 'wan' | 'virtual';
export const LINK_MEDIA: LinkMedia[] = ['copper', 'fiber', 'wireless', 'wan', 'virtual'];

/** Логический протокол поверх физической связи (только визуально, без проверок). */
export type LinkProtocol = 'ospf' | 'bgp';
export const LINK_PROTOCOLS: LinkProtocol[] = ['ospf', 'bgp'];

export interface LinkEndpoint {
  deviceId: string;
  portId?: string | null;
}

export interface Link {
  id: string;
  a: LinkEndpoint;
  b: LinkEndpoint;
  media: LinkMedia;
  label?: string;
  /** Ручной override цвета; иначе цвет вычисляется из media/скорости. */
  color?: string | null;
  style?: {
    width?: number;
    dashed?: boolean;
  };
  /** Изломы на холсте. */
  points?: Array<{ x: number; y: number }>;
  layerId?: string;
  /** OSPF/BGP поверх связи: area или номера AS — просто подпись на холсте. */
  protocol?: LinkProtocol | null;
  protocolDetail?: string;
}

export type AnnotationKind = 'rect' | 'ellipse' | 'text' | 'line' | 'arrow' | 'note';

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  layerId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  text?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  /** Прозрачность рисунка поверх подложки: 0…1. */
  opacity?: number;
}

export interface Layer {
  id: string;
  name: string;
  kind: 'annotation' | 'structure';
  /** Порядок отрисовки: больше — выше. */
  z: number;
  visible: boolean;
  locked: boolean;
  /** Структурный слой всегда рисуется поверх рисунков, пока не отключено. */
  pinnedTop?: boolean;
  color?: string;
  opacity?: number;
}

export interface IpBlock {
  id: string;
  cidr: string;
  name: string;
  owner?: string;
  note?: string;
  color?: string;
}

/** Ручная группа подсетей плана: вложенность не глубже трёх уровней. */
export interface IpGroup {
  id: string;
  name: string;
  /** null/undefined — верхний уровень. */
  parentId?: string | null;
  blockIds: string[];
}

export const IP_GROUP_MAX_DEPTH = 3;

export interface ProjectSettings {
  defaultView: 'list' | 'canvas';
  grid: number;
  snap: boolean;
  showGrid: boolean;
}

export interface ProjectDocument {
  schema: typeof SCHEMA;
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  layers: Layer[];
  groups: Group[];
  devices: Device[];
  links: Link[];
  annotations: Annotation[];
  ipPlan: { blocks: IpBlock[]; groups?: IpGroup[] };
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  updatedAt: number;
  devices: number;
  links: number;
  blocks: number;
}

/* ------------------------------------------------------------------ */
/* Идентификаторы и конструкторы                                       */
/* ------------------------------------------------------------------ */

export function uid(prefix = ''): string {
  const value =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return prefix ? `${prefix}_${value}` : value;
}

export const STRUCTURE_LAYER = 'layer_structure';
export const NOTES_LAYER = 'layer_notes';

export function createProject(name = 'Новый проект', description = ''): ProjectDocument {
  const now = Date.now();
  return {
    schema: SCHEMA,
    id: uid('prj'),
    name,
    description,
    createdAt: now,
    updatedAt: now,
    settings: { defaultView: 'list', grid: 16, snap: true, showGrid: true },
    layers: [
      {
        id: NOTES_LAYER,
        name: 'Заметки и рисунки',
        kind: 'annotation',
        z: 10,
        visible: true,
        locked: false,
      },
      {
        id: STRUCTURE_LAYER,
        name: 'Устройства и связи',
        kind: 'structure',
        z: 100,
        visible: true,
        locked: false,
        pinnedTop: true,
      },
    ],
    groups: [],
    devices: [],
    links: [],
    annotations: [],
    ipPlan: { blocks: [], groups: [] },
  };
}

export function createPort(overrides: Partial<Port> = {}): Port {
  return {
    id: uid('port'),
    name: overrides.name ?? 'eth0',
    media: overrides.media ?? 'copper',
    speed: overrides.speed ?? '1G',
    mode: overrides.mode ?? 'access',
    vlan: overrides.vlan ?? null,
    mac: overrides.mac ?? '',
    description: overrides.description ?? '',
    ips: overrides.ips ?? [],
    kind: overrides.kind ?? 'physical',
    members: overrides.members,
  };
}

export function createDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: uid('dev'),
    name: overrides.name ?? 'new-device',
    kind: overrides.kind ?? 'pc',
    attrs: {
      layer: overrides.attrs?.layer ?? 'L3',
      os: overrides.attrs?.os ?? '',
      role: overrides.attrs?.role ?? '',
      vendor: overrides.attrs?.vendor ?? '',
      model: overrides.attrs?.model ?? '',
      location: overrides.attrs?.location ?? '',
      serial: overrides.attrs?.serial ?? '',
      note: overrides.attrs?.note ?? '',
    },
    tags: overrides.tags ?? [],
    groupId: overrides.groupId ?? null,
    groupIds: overrides.groupIds ?? [],
    ports: overrides.ports ?? [createPort({ name: 'eth0' })],
    canvas: overrides.canvas,
  };
}

/** Все группы устройства: основной groupId + дополнительные groupIds без дублей. */
export function deviceGroupIds(device: Device): string[] {
  const result: string[] = [];
  if (device.groupId) result.push(device.groupId);
  for (const id of device.groupIds ?? []) {
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

export function createIpAssignment(
  address: string,
  prefix: number,
  role: IpRole = 'static',
): IpAssignment {
  const parsed = parseAddress(address);
  return { id: uid('ip'), family: parsed.family, address, prefix, role };
}

export function createGroup(name: string): Group {
  return { id: uid('grp'), name, color: '#4d9cff', parentId: null, collapsed: false };
}

/* ------------------------------------------------------------------ */
/* Логические порты: мосты, бонды, VLAN                                */
/* ------------------------------------------------------------------ */

export function isLogicalPort(port: Port): boolean {
  return port.kind === 'bridge' || port.kind === 'bond' || port.kind === 'vlan';
}

/** Мост или бонд: у них адреса и подключения считаются на самом логическом порту. */
export function isBridgePort(port: Port): boolean {
  return port.kind === 'bridge' || port.kind === 'bond';
}

/** Все порты, которые входят в мосты и бонды (для пометки «→ br0» в редакторе). */
export function memberPortIds(device: Device): Set<string> {
  const ids = new Set<string>();
  for (const port of device.ports) {
    if (!isBridgePort(port)) continue;
    for (const id of port.members ?? []) ids.add(id);
  }
  return ids;
}

/**
 * Порты, к которым можно подключить связь: физические (в том числе члены моста —
 * логически подключение принадлежит мосту) и сами мосты/бонды. VLAN-сабинтерфейсы
 * физических связей не имеют.
 */
export function linkablePorts(device: Device): Port[] {
  return device.ports.filter((port) => port.kind !== 'vlan');
}

/** Мост, в который входит порт. */
export function bridgeOfPort(device: Device, portId: string): Port | undefined {
  return device.ports.find(
    (port) => isBridgePort(port) && (port.members ?? []).includes(portId),
  );
}

/** VLAN-сабинтерфейсы, созданные под портом. */
export function vlansOfPort(device: Device, portId: string): Port[] {
  return device.ports.filter(
    (port) => port.kind === 'vlan' && (port.members ?? []).includes(portId),
  );
}

/** VLAN-сабинтерфейс под физическим портом: te1 + 10 → te1.10 с members=[te1]. */
export function createVlan(device: Device, portId: string, vlanId: number): Device {
  const parent = device.ports.find((port) => port.id === portId);
  if (!parent || isLogicalPort(parent)) return device;
  const id = Math.trunc(vlanId);
  if (!Number.isFinite(id) || id < 1 || id > 4094) return device;
  const exists = device.ports.some(
    (port) =>
      port.kind === 'vlan' && port.vlan === id && (port.members ?? []).includes(portId),
  );
  if (exists) return device;

  const used = new Set(device.ports.map((port) => port.name));
  let name = `${parent.name}.${id}`;
  let suffix = 2;
  while (used.has(name)) name = `${parent.name}.${id}_${suffix++}`;

  const vlan = createPort({ name, media: 'virtual', mode: 'access' });
  vlan.kind = 'vlan';
  vlan.vlan = id;
  vlan.members = [portId];
  return { ...device, ports: [...device.ports, vlan] };
}

/** Свободное имя для нового моста: br0, br1, … */
export function nextBridgeName(device: Device): string {
  const used = new Set(device.ports.map((port) => port.name));
  for (let i = 0; i < 1000; i++) {
    const candidate = `br${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `br${device.ports.length}`;
}

/**
 * Создаёт мост из физических портов (ens34 + ens35 + ens36 → br0).
 * Порт-участник может входить только в один мост: из других он исключается,
 * а опустевшие мосты удаляются. Чистая функция, возвращает новое устройство.
 */
export function createBridge(device: Device, memberIds: string[], name?: string): Device {
  const valid = memberIds.filter((id) => {
    const port = device.ports.find((item) => item.id === id);
    return !!port && !isLogicalPort(port);
  });
  const unique = [...new Set(valid)];
  if (unique.length === 0) return device;

  const bridgeName = name?.trim() || nextBridgeName(device);
  const ports: Port[] = [];
  for (const port of device.ports) {
    if (!isBridgePort(port)) {
      ports.push(port);
      continue;
    }
    const members = (port.members ?? []).filter((id) => !unique.includes(id));
    if (members.length === 0) continue; // мост без участников больше не нужен
    ports.push({ ...port, members });
  }

  const bridge = createPort({ name: bridgeName, media: 'virtual', mode: 'access' });
  bridge.kind = 'bridge';
  bridge.members = unique;
  return { ...device, ports: [...ports, bridge] };
}

/** Заменяет состав участников существующего моста. */
export function setBridgeMembers(device: Device, bridgeId: string, memberIds: string[]): Device {
  const bridge = device.ports.find((port) => port.id === bridgeId && isLogicalPort(port));
  if (!bridge) return device;
  const valid = memberIds.filter((id) => {
    if (id === bridgeId) return false;
    const port = device.ports.find((item) => item.id === id);
    return !!port && !isLogicalPort(port);
  });
  const unique = [...new Set(valid)];
  const ports: Port[] = [];
  for (const port of device.ports) {
    if (port.id === bridgeId) {
      ports.push({ ...port, members: unique });
      continue;
    }
    if (!isBridgePort(port)) {
      ports.push(port);
      continue;
    }
    const members = (port.members ?? []).filter((id) => !unique.includes(id));
    if (members.length === 0) continue;
    ports.push({ ...port, members });
  }
  return { ...device, ports };
}

/* ------------------------------------------------------------------ */
/* Разбор и проверка                                                   */
/* ------------------------------------------------------------------ */

export interface IpRef {
  deviceId: string;
  deviceName: string;
  portId: string;
  portName: string;
  ipId: string;
  family: Family;
  address: bigint;
  text: string;
  prefix: number;
  role: IpRole;
}

export function portIps(device: Device, port: Port): IpRef[] {
  const out: IpRef[] = [];
  for (const ip of port.ips) {
    try {
      const parsed = parseAddress(ip.address);
      out.push({
        deviceId: device.id,
        deviceName: device.name,
        portId: port.id,
        portName: port.name,
        ipId: ip.id,
        family: parsed.family,
        address: parsed.address,
        text: formatAddress(parsed.family, parsed.address),
        prefix: ip.prefix,
        role: ip.role,
      });
    } catch {
      /* некорректные адреса отлавливает validateProject */
    }
  }
  return out;
}

export function allIps(device: Device): IpRef[] {
  return device.ports.flatMap((port) => portIps(device, port));
}

export function projectIps(doc: ProjectDocument): IpRef[] {
  return doc.devices.flatMap(allIps);
}

export interface DhcpPool {
  deviceId: string;
  deviceName: string;
  portId: string;
  portName: string;
  ipId: string;
  family: Family;
  /** Адрес сети и последний адрес пула. */
  network: bigint;
  last: bigint;
  prefix: number;
  /** Нормализованный CIDR пула. */
  text: string;
  /** Диапазон выдачи (включительно); по умолчанию — все хосты пула. */
  rangeFrom: bigint;
  rangeTo: bigint;
  rangeText: string;
  /** Диапазон задан вручную и укладывается в пул. */
  rangeCustom: boolean;
  /** Введённый диапазон не удалось применить — показываем подсказку. */
  rangeInvalid: boolean;
  /** Сколько адресов может выдать DHCP в текущем диапазоне. */
  usable: bigint;
  /** Пул записан не адресом сети — в UI подскажем правильный CIDR. */
  normalized: boolean;
  networkText: string;
  /** Статические адреса, попавшие внутрь диапазона выдачи. */
  inside: IpRef[];
}

/** Первый и последний адрес, которые DHCP может выдать в подсети. */
export function dhcpHostRange(
  family: Family,
  network: bigint,
  last: bigint,
): { from: bigint; to: bigint } {
  if (family === 4 && last - network >= 2n) {
    return { from: network + 1n, to: last - 1n };
  }
  return { from: network, to: last };
}

/** DHCP-пулы проекта: интерфейс с ролью DHCP и CIDR в поле адреса. */
export function dhcpPools(doc: ProjectDocument): DhcpPool[] {
  const all = projectIps(doc);
  const pools: DhcpPool[] = [];
  for (const device of doc.devices) {
    for (const port of device.ports) {
      for (const ip of port.ips) {
        if (ip.role !== 'dhcp' || !ip.address.trim()) continue;
        try {
          const parsed = parseAddress(ip.address);
          const bits = parsed.family === 4 ? 32 : 128;
          if (ip.prefix < 0 || ip.prefix > bits) continue;
          const info = subnetOf(parsed.family, parsed.address, ip.prefix);
          const hostRange = dhcpHostRange(parsed.family, info.network, info.last);

          // Ручной диапазон применяем только если он целиком внутри пула.
          let rangeFrom = hostRange.from;
          let rangeTo = hostRange.to;
          let rangeCustom = false;
          let rangeInvalid = false;
          const rawFrom = ip.poolFrom?.trim();
          const rawTo = ip.poolTo?.trim();
          if (rawFrom || rawTo) {
            try {
              if (!rawFrom || !rawTo) throw new IpError('нужны оба конца диапазона');
              const from = parseAddress(rawFrom);
              const to = parseAddress(rawTo);
              const fits =
                from.family === parsed.family &&
                to.family === parsed.family &&
                from.address >= info.network &&
                to.address <= info.last &&
                from.address <= to.address;
              if (!fits) throw new IpError('диапазон вне пула');
              rangeFrom = from.address;
              rangeTo = to.address;
              rangeCustom = true;
            } catch {
              rangeInvalid = true;
            }
          }

          const usable = rangeTo >= rangeFrom ? rangeTo - rangeFrom + 1n : 0n;
          const inside = all.filter(
            (ref) =>
              ref.role !== 'dhcp' &&
              ref.family === parsed.family &&
              ref.address >= rangeFrom &&
              ref.address <= rangeTo,
          );
          pools.push({
            deviceId: device.id,
            deviceName: device.name,
            portId: port.id,
            portName: port.name,
            ipId: ip.id,
            family: parsed.family,
            network: info.network,
            last: info.last,
            prefix: ip.prefix,
            text: info.networkText,
            rangeFrom,
            rangeTo,
            rangeText: `${formatAddress(parsed.family, rangeFrom)} – ${formatAddress(
              parsed.family,
              rangeTo,
            )}`,
            rangeCustom,
            rangeInvalid,
            usable,
            normalized: parsed.address === info.network,
            networkText: info.networkText,
            inside,
          });
        } catch {
          /* некорректный адрес отлавливает validateProject */
        }
      }
    }
  }
  return pools;
}

/**
 * Создаёт DHCP-пул на порту по блоку плана адресов.
 * `from`/`to` — необязательный ручной диапазон выдачи.
 */
export function createDhcpPool(
  doc: ProjectDocument,
  options: {
    blockId: string;
    deviceId: string;
    portId: string;
    from?: string;
    to?: string;
  },
): ProjectDocument {
  const block = doc.ipPlan.blocks.find((item) => item.id === options.blockId);
  if (!block) return doc;
  let parsed: { family: Family; address: bigint; prefix: number };
  try {
    parsed = parseCidr(block.cidr);
  } catch {
    return doc;
  }
  const info = subnetOf(parsed.family, parsed.address, parsed.prefix);
  const networkText = formatAddress(parsed.family, info.network);

  const ip: IpAssignment = {
    id: uid('ip'),
    family: parsed.family,
    address: networkText,
    prefix: parsed.prefix,
    role: 'dhcp',
  };
  if (options.from?.trim() && options.to?.trim()) {
    ip.poolFrom = options.from.trim();
    ip.poolTo = options.to.trim();
  }

  return {
    ...doc,
    devices: doc.devices.map((device) => {
      if (device.id !== options.deviceId) return device;
      return {
        ...device,
        ports: device.ports.map((port) => {
          if (port.id !== options.portId) return port;
          const already = port.ips.some(
            (item) =>
              item.role === 'dhcp' &&
              item.prefix === ip.prefix &&
              item.address === ip.address &&
              item.family === ip.family,
          );
          return already ? port : { ...port, ips: [...port.ips, ip] };
        }),
      };
    }),
  };
}

export function findDevice(doc: ProjectDocument, id: string): Device | undefined {
  return doc.devices.find((device) => device.id === id);
}

export function findGroup(doc: ProjectDocument, id: string | null | undefined): Group | undefined {
  return id ? doc.groups.find((group) => group.id === id) : undefined;
}

/** Подсеть адреса: сеть, последний адрес и текст сети (для подсказок в редакторе). */
export function subnetOf(
  family: Family,
  address: bigint,
  prefix: number,
): { network: bigint; last: bigint; networkText: string; family: Family; prefix: number } {
  const bits = family === 4 ? 32 : 128;
  const hostBits = Math.max(0, bits - prefix);
  const network = address & maskFor(family, prefix);
  const last = network | ((1n << BigInt(hostBits)) - 1n);
  return {
    family,
    prefix,
    network,
    last,
    networkText: `${formatAddress(family, network)}/${prefix}`,
  };
}

export function defaultPortName(device: Device): string {
  const used = new Set(device.ports.map((port) => port.name));
  for (let i = 1; i < 200; i++) {
    const candidate = `eth${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `eth${device.ports.length + 1}`;
}

export function updateTimestamp(doc: ProjectDocument): ProjectDocument {
  return { ...doc, updatedAt: Date.now() };
}

/* ------------------------------------------------------------------ */
/* Диагностика                                                         */
/* ------------------------------------------------------------------ */

export type IssueLevel = 'error' | 'warning' | 'info';

export interface Issue {
  id: string;
  level: IssueLevel;
  message: string;
  deviceId?: string;
  portId?: string;
  blockId?: string;
}

const MAC_RE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;

export function validateProject(doc: ProjectDocument): Issue[] {
  const issues: Issue[] = [];
  const push = (level: IssueLevel, message: string, extra: Partial<Issue> = {}) => {
    issues.push({ id: uid('iss'), level, message, ...extra });
  };

  // имена устройств
  const names = new Map<string, number>();
  for (const device of doc.devices) {
    const key = device.name.trim().toLowerCase();
    if (!key) {
      push('error', `Устройство без имени (${device.id})`, { deviceId: device.id });
    }
    names.set(key, (names.get(key) ?? 0) + 1);
  }
  for (const [name, count] of names) {
    if (name && count > 1) push('error', `Имя устройства «${name}» встречается ${count} раза`);
  }

  // IP: формат, дубликаты, маска
  const ipIndex = new Map<string, IpRef[]>();
  const macIndex = new Map<string, number>();

  for (const device of doc.devices) {
    for (const port of device.ports) {
      if (port.mac && port.mac.trim()) {
        if (!MAC_RE.test(port.mac.trim())) {
          push('error', `Некорректный MAC «${port.mac}» на ${device.name} / ${port.name}`, {
            deviceId: device.id,
            portId: port.id,
          });
        } else {
          const key = port.mac.trim().toLowerCase();
          macIndex.set(key, (macIndex.get(key) ?? 0) + 1);
        }
      }

      const families = new Map<Family, number>();
      for (const ip of port.ips) {
        let parsed: { family: Family; address: bigint };
        try {
          parsed = parseAddress(ip.address);
        } catch (error) {
          push(
            'error',
            `Некорректный IP «${ip.address}» на ${device.name} / ${port.name}: ${
              error instanceof IpError ? error.message : 'ошибка разбора'
            }`,
            { deviceId: device.id, portId: port.id },
          );
          continue;
        }
        if (ip.prefix < 0 || ip.prefix > (parsed.family === 4 ? 32 : 128)) {
          push('error', `Некорректный префикс /${ip.prefix} на ${device.name} / ${port.name}`, {
            deviceId: device.id,
            portId: port.id,
          });
          continue;
        }
        const normalized = formatAddress(parsed.family, parsed.address);
        const key = `${parsed.family}:${normalized}`;
        const refs = ipIndex.get(key) ?? [];
        refs.push({
          deviceId: device.id,
          deviceName: device.name,
          portId: port.id,
          portName: port.name,
          ipId: ip.id,
          family: parsed.family,
          address: parsed.address,
          text: normalized,
          prefix: ip.prefix,
          role: ip.role,
        });
        ipIndex.set(key, refs);

        families.set(parsed.family, (families.get(parsed.family) ?? 0) + (ip.role === 'dhcp' ? 0 : 1));

        if (ip.family !== parsed.family) {
          push(
            'error',
            `Семейство адреса ${normalized} не совпадает с указанным (IPv${ip.family})`,
            { deviceId: device.id, portId: port.id },
          );
        }

        const bits = parsed.family === 4 ? 32 : 128;
        const hostBits = bits - ip.prefix;
        if (hostBits >= 2 && ip.role !== 'dhcp') {
          const subnet = subnetOf(parsed.family, parsed.address, ip.prefix);
          if (parsed.address === subnet.network) {
            push('warning', `${normalized} — адрес сети ${subnet.networkText}, его нельзя назначать хосту`, {
              deviceId: device.id,
              portId: port.id,
            });
          } else if (parsed.address === subnet.last) {
            push(
              'warning',
              parsed.family === 4
                ? `${normalized} — широковещательный адрес подсети ${subnet.networkText}`
                : `${normalized} — последний адрес подсети ${subnet.networkText} (резервный для IPv6)`,
              { deviceId: device.id, portId: port.id },
            );
          }
        }
      }

      for (const [family, count] of families) {
        if (count > 1) {
          push(
            'warning',
            `На ${device.name} / ${port.name} несколько IPv${family}-адресов — проверьте, нужен ли вторичный адрес`,
            { deviceId: device.id, portId: port.id },
          );
        }
      }
    }
  }

  for (const [, refs] of ipIndex) {
    // VIP/VRRP-адрес по определению общий — не считаем дубликатом.
    // DHCP — это адрес сети (пул), а не занятый адрес хоста.
    const physical = refs.filter((ref) => ref.role !== 'vip' && ref.role !== 'dhcp');
    if (physical.length > 1) {
      const where = physical.map((ref) => `${ref.deviceName} / ${ref.portName}`).join(', ');
      push('error', `Дубликат IP ${physical[0].text}: ${where}`, {
        deviceId: physical[0].deviceId,
        portId: physical[0].portId,
      });
    }
  }

  for (const [mac, count] of macIndex) {
    if (count > 1) push('warning', `MAC ${mac} встречается ${count} раза`);
  }

  // связи
  const usedPorts = new Map<string, number>();
  for (const link of doc.links) {
    for (const [side, endpoint] of [
      ['A', link.a],
      ['B', link.b],
    ] as const) {
      const device = findDevice(doc, endpoint.deviceId);
      if (!device) {
        push('error', `Связь ${link.label || link.id}: сторона ${side} ссылается на удалённое устройство`);
        continue;
      }
      if (endpoint.portId) {
        const port = device.ports.find((item) => item.id === endpoint.portId);
        if (!port) {
          push('error', `Связь ${link.label || link.id}: у ${device.name} нет порта ${endpoint.portId}`, {
            deviceId: device.id,
          });
        } else {
          // Подключение в порт-участник логически принадлежит мосту:
          // несколько кабелей в разные порты — это не «порт занят дважды».
          const owner = bridgeOfPort(device, port.id) ?? port;
          const key = `${device.id}:${owner.id}`;
          usedPorts.set(key, (usedPorts.get(key) ?? 0) + 1);
        }
      }
    }
    if (link.a.deviceId === link.b.deviceId && link.a.portId && link.a.portId === link.b.portId) {
      push('error', `Связь ${link.label || link.id} соединяет порт сам с собой`);
    }
  }
  for (const [key, count] of usedPorts) {
    const [deviceId, portId] = key.split(':');
    const device = findDevice(doc, deviceId);
    const port = device?.ports.find((item) => item.id === portId);
    if (!port) continue;
    if (isBridgePort(port)) {
      const memberCount = (port.members ?? []).length;
      if (count > Math.max(1, memberCount)) {
        push(
          'warning',
          `Мост ${device?.name ?? deviceId} / ${port.name}: ${count} подключений, но портов-участников ${memberCount}`,
          { deviceId, portId },
        );
      }
      continue;
    }
    if (count > 1) {
      push('warning', `Порт ${device?.name ?? deviceId} / ${port.name} используется в ${count} связях`, {
        deviceId,
        portId,
      });
    }
  }

  // группы
  const groupIds = new Set(doc.groups.map((group) => group.id));
  for (const device of doc.devices) {
    for (const id of deviceGroupIds(device)) {
      if (!groupIds.has(id)) {
        push('warning', `${device.name}: группа ${id} не найдена`, { deviceId: device.id });
      }
    }
  }

  // логические порты: мосты, бонды, VLAN
  for (const device of doc.devices) {
    const owners = new Map<string, string>();
    for (const port of device.ports) {
      if (!isLogicalPort(port)) continue;
      const members = port.members ?? [];

      if (port.kind === 'vlan') {
        const vlanId = port.vlan ?? 0;
        if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) {
          push('error', `${device.name}: ${port.name} — номер VLAN должен быть 1…4094`, {
            deviceId: device.id,
            portId: port.id,
          });
        }
        if (members.length !== 1) {
          push('error', `${device.name}: VLAN ${port.name} должен ссылаться на один физический порт`, {
            deviceId: device.id,
            portId: port.id,
          });
        }
        for (const id of members) {
          const member = device.ports.find((item) => item.id === id);
          if (!member) {
            push('error', `${device.name}: ${port.name} ссылается на удалённый порт ${id}`, {
              deviceId: device.id,
              portId: port.id,
            });
          } else if (isLogicalPort(member)) {
            push('error', `${device.name}: ${port.name} не может быть создан под логическим портом ${member.name}`, {
              deviceId: device.id,
              portId: port.id,
            });
          }
        }
        continue;
      }

      if (members.length === 0) {
        push('warning', `${device.name}: ${port.name} не содержит портов-участников`, {
          deviceId: device.id,
          portId: port.id,
        });
      }
      for (const id of members) {
        const member = device.ports.find((item) => item.id === id);
        if (!member) {
          push('error', `${device.name}: ${port.name} ссылается на удалённый порт ${id}`, {
            deviceId: device.id,
            portId: port.id,
          });
          continue;
        }
        if (isLogicalPort(member)) {
          push('error', `${device.name}: ${port.name} не может включать логический порт ${member.name}`, {
            deviceId: device.id,
            portId: port.id,
          });
          continue;
        }
        const other = owners.get(id);
        if (other) {
          push('error', `${device.name}: порт ${member.name} входит в несколько мостов (${other}, ${port.name})`, {
            deviceId: device.id,
            portId: port.id,
          });
        } else {
          owners.set(id, port.name);
        }
        if (member.ips.length > 0) {
          push(
            'warning',
            `${device.name}: у ${member.name} есть IP, но порт входит в ${port.name} — адрес стоит перенести на ${port.name}`,
            { deviceId: device.id, portId: member.id },
          );
        }
      }
    }
  }

  // план адресов
  const blocks: Array<{ id: string; block: ReturnType<typeof parseCidr> }> = [];
  for (const item of doc.ipPlan.blocks) {
    try {
      blocks.push({ id: item.id, block: parseCidr(item.cidr) });
    } catch (error) {
      push(
        'error',
        `Блок «${item.name}»: ${error instanceof IpError ? error.message : 'некорректный CIDR'}`,
        { blockId: item.id },
      );
    }
  }
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];
      if (a.block.family !== b.block.family) continue;
      const aLast = a.block.address | ((1n << BigInt((a.block.family === 4 ? 32 : 128) - a.block.prefix)) - 1n);
      const bLast = b.block.address | ((1n << BigInt((b.block.family === 4 ? 32 : 128) - b.block.prefix)) - 1n);
      if (a.block.address <= bLast && b.block.address <= aLast) {
        push('error', `Блоки ${a.block.input} и ${b.block.input} пересекаются`, { blockId: b.id });
      }
    }
  }

  // DHCP-пулы: пересечения, размер и попадание в план адресов
  const pools = dhcpPools(doc);
  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    const at = { deviceId: pool.deviceId, portId: pool.portId };
    // Если в плане есть блок ровно под этот пул, «неровный» адрес — не проблема:
    // пользователь уже выбрал сеть в плане.
    const exactBlock = blocks.some(({ block }) => {
      if (block.family !== pool.family || block.prefix !== pool.prefix) return false;
      const network = block.address & maskFor(block.family, block.prefix);
      return network === pool.network;
    });
    if (!pool.normalized && !exactBlock) {
      push(
        'warning',
        `DHCP-пул на ${pool.deviceName} / ${pool.portName} лучше указать адресом сети: ${pool.text}`,
        at,
      );
    }
    if (pool.family === 4 && pool.prefix >= 31) {
      push('warning', `DHCP-пул ${pool.text} слишком мал: адресов для выдачи нет`, at);
    }
    if (pool.rangeInvalid) {
      push(
        'error',
        `DHCP-пул ${pool.text} (${pool.deviceName}): диапазон выдачи задан неверно — нужны два адреса внутри пула, «с» не больше «по»`,
        at,
      );
    } else if (pool.usable === 0n) {
      push('warning', `DHCP-пул ${pool.text} (${pool.deviceName}): в диапазоне выдачи нет адресов`, at);
    }
    for (let j = i + 1; j < pools.length; j++) {
      const other = pools[j];
      if (pool.family !== other.family) continue;
      if (pool.network <= other.last && other.network <= pool.last) {
        push(
          'error',
          `DHCP-пулы ${pool.text} (${pool.deviceName}) и ${other.text} (${other.deviceName}) пересекаются`,
          at,
        );
      }
    }
    if (blocks.length > 0) {
      const inside = blocks.some(({ block }) => {
        if (block.family !== pool.family) return false;
        const bits = block.family === 4 ? 32 : 128;
        const network = block.address & maskFor(block.family, block.prefix);
        const last = block.address | ((1n << BigInt(bits - block.prefix)) - 1n);
        return pool.network >= network && pool.last <= last;
      });
      if (!inside) {
        push(
          'warning',
          `DHCP-пул ${pool.text} (${pool.deviceName}) не входит целиком ни в один блок плана`,
          at,
        );
      }
    }
    if (pool.inside.length > 0) {
      const where = pool.inside
        .map((ref) => `${ref.text} (${ref.deviceName} / ${ref.portName})`)
        .join(', ');
      push(
        'warning',
        `DHCP-пул ${pool.text} (${pool.deviceName}) пересекается со статическими адресами: ${where}`,
        at,
      );
    }
  }

  // адреса вне объявленных блоков
  if (blocks.length > 0) {
    for (const ref of projectIps(doc)) {
      const inside = blocks.some(
        (item) =>
          item.block.family === ref.family &&
          ref.address >= (item.block.address & maskFor(item.block.family, item.block.prefix)) &&
          ref.address <=
            (item.block.address | ((1n << BigInt((ref.family === 4 ? 32 : 128) - item.block.prefix)) - 1n)),
      );
      if (!inside) {
        push('warning', `${ref.text} (${ref.deviceName}) не входит ни в один блок плана`, {
          deviceId: ref.deviceId,
          portId: ref.portId,
        });
      }
    }
  } else if (doc.devices.length > 0) {
    push('info', 'План адресов пуст: добавьте блоки, чтобы проверять адреса устройств');
  }

  return issues;
}

function maskFor(family: Family, prefix: number): bigint {
  const bits = family === 4 ? 32 : 128;
  const max = (1n << BigInt(bits)) - 1n;
  return prefix === 0 ? 0n : (max << BigInt(bits - prefix)) & max;
}

export function errorCount(issues: Issue[]): number {
  return issues.filter((issue) => issue.level === 'error').length;
}

export function warningCount(issues: Issue[]): number {
  return issues.filter((issue) => issue.level === 'warning').length;
}

/* ------------------------------------------------------------------ */
/* Сводки и поиск                                                      */
/* ------------------------------------------------------------------ */

export function summarize(doc: ProjectDocument): ProjectSummary {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description,
    updatedAt: doc.updatedAt,
    devices: doc.devices.length,
    links: doc.links.length,
    blocks: doc.ipPlan.blocks.length,
  };
}

export function deviceIpText(device: Device): string {
  const ips = allIps(device);
  if (ips.length === 0) return '';
  const first = ips[0];
  return `${first.text}/${first.prefix}`;
}

export function searchDevices(doc: ProjectDocument, query: string): Device[] {
  const q = query.trim().toLowerCase();
  if (!q) return doc.devices;
  return doc.devices.filter((device) => {
    const haystack = [
      device.name,
      device.kind,
      device.attrs.layer,
      device.attrs.os,
      device.attrs.role,
      device.attrs.vendor,
      device.attrs.model,
      device.attrs.location,
      ...device.tags,
      ...device.ports.flatMap((port) => [
        port.name,
        port.mac,
        ...port.ips.map((ip) => ip.address),
      ]),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function projectCounts(doc: ProjectDocument): {
  devices: number;
  ports: number;
  ips: number;
  links: number;
  groups: number;
} {
  let ports = 0;
  let ips = 0;
  for (const device of doc.devices) {
    ports += device.ports.length;
    for (const port of device.ports) ips += port.ips.length;
  }
  return {
    devices: doc.devices.length,
    ports,
    ips,
    links: doc.links.length,
    groups: doc.groups.length,
  };
}

/* ------------------------------------------------------------------ */
/* Импорт/экспорт                                                      */
/* ------------------------------------------------------------------ */

export class ProjectImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectImportError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Мягкая валидация импортируемого JSON с заполнением недостающих полей. */
export function migrateDocument(raw: unknown): ProjectDocument {
  if (!isRecord(raw)) throw new ProjectImportError('Файл не содержит объект проекта');
  if (raw.schema !== SCHEMA) {
    throw new ProjectImportError(
      `Неизвестная версия схемы: ${String(raw.schema ?? 'без схемы')}. Ожидается ${SCHEMA}`,
    );
  }

  const fallback = createProject();
  const doc: ProjectDocument = {
    ...fallback,
    ...(raw as unknown as ProjectDocument),
    schema: SCHEMA,
    settings: { ...fallback.settings, ...((raw.settings as ProjectSettings) ?? {}) },
    layers: Array.isArray(raw.layers) && raw.layers.length > 0 ? raw.layers as Layer[] : fallback.layers,
    groups: Array.isArray(raw.groups) ? (raw.groups as Group[]) : [],
    devices: Array.isArray(raw.devices) ? (raw.devices as Device[]) : [],
    links: Array.isArray(raw.links) ? (raw.links as Link[]) : [],
    annotations: Array.isArray(raw.annotations) ? (raw.annotations as Annotation[]) : [],
    ipPlan: {
      blocks:
        isRecord(raw.ipPlan) && Array.isArray(raw.ipPlan.blocks)
          ? (raw.ipPlan.blocks as IpBlock[])
          : [],
      groups:
        isRecord(raw.ipPlan) && Array.isArray(raw.ipPlan.groups)
          ? (raw.ipPlan.groups as IpGroup[]).filter(
              (group) =>
                isRecord(group) &&
                typeof group.id === 'string' &&
                typeof group.name === 'string' &&
                Array.isArray(group.blockIds),
            )
          : [],
    },
  };

  doc.devices = doc.devices.map((device) => ({
    ...createDevice(),
    ...device,
    attrs: { ...createDevice().attrs, ...(device.attrs ?? {}) },
    tags: Array.isArray(device.tags) ? device.tags : [],
    ports: Array.isArray(device.ports)
      ? device.ports.map((port) => ({
          ...createPort(),
          ...port,
          ips: Array.isArray(port.ips) ? port.ips : [],
        }))
      : [],
  }));

  if (typeof doc.name !== 'string' || !doc.name.trim()) doc.name = 'Импортированный проект';
  if (typeof doc.description !== 'string') doc.description = '';
  return doc;
}

export function exportDocument(doc: ProjectDocument): string {
  return JSON.stringify({ ...doc, updatedAt: Date.now() }, null, 2);
}

/** Импорт как новый проект: свежий id, чтобы не перетереть существующий. */
export function importAsNewProject(raw: unknown): ProjectDocument {
  const doc = migrateDocument(raw);
  return {
    ...doc,
    id: uid('prj'),
    name: doc.name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function parseIpOrNull(text: string): bigint | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return trimmed.includes(':') ? parseIPv6(trimmed) : parseIPv4(trimmed);
  } catch {
    return null;
  }
}
