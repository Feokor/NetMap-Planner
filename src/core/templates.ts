/**
 * Шаблоны устройств: типовые порты, слой и роль.
 * Стартовый набор — обычные редактируемые шаблоны, а не жёсткие пресеты.
 */

import {
  createDevice,
  createPort,
  type Device,
  type DeviceKind,
  type DeviceLayer,
  type PortMedia,
  type PortMode,
  type ProjectDocument,
} from './project';

export interface TemplatePort {
  name: string;
  media?: PortMedia;
  speed?: string;
  mode?: PortMode;
  vlan?: number | null;
  description?: string;
}

export interface DeviceTemplate {
  id: string;
  name: string;
  kind: DeviceKind;
  layer: DeviceLayer;
  os?: string;
  role?: string;
  vendor?: string;
  tags: string[];
  ports: TemplatePort[];
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}

const copper = (names: string[], speed = '1G'): TemplatePort[] =>
  names.map((name) => ({ name, media: 'copper', speed }));

const builtin = (
  id: string,
  name: string,
  kind: DeviceKind,
  layer: DeviceLayer,
  ports: TemplatePort[],
  favorite = false,
): DeviceTemplate => ({
  id,
  name,
  kind,
  layer,
  tags: [],
  ports,
  favorite,
  createdAt: 0,
  updatedAt: 0,
});

/** Стартовая библиотека: попадает в хранилище один раз и дальше редактируется. */
export const BUILTIN_TEMPLATES: DeviceTemplate[] = [
  builtin('tpl_router', 'Маршрутизатор', 'router', 'L3', [
    { name: 'te0', media: 'fiber', speed: '10G' },
    { name: 'te1', media: 'fiber', speed: '10G' },
    ...copper(['gi0/0', 'gi0/1']),
  ], true),
  builtin('tpl_switch', 'Коммутатор', 'switch', 'L2', copper([
    'gi0/1', 'gi0/2', 'gi0/3', 'gi0/4', 'gi0/5', 'gi0/6', 'gi0/7', 'gi0/8',
  ]), true),
  builtin('tpl_firewall', 'Firewall', 'firewall', 'L3', copper(['wan', 'lan0', 'lan1', 'lan2'])),
  builtin('tpl_server', 'Сервер', 'server', 'L3', copper(['ens18', 'ens19']), true),
  builtin('tpl_pc', 'ПК', 'pc', 'L3', copper(['eth0']), true),
  builtin('tpl_ap', 'Точка доступа', 'ap', 'L2', [
    { name: 'eth0', media: 'copper', speed: '1G' },
    { name: 'wlan0', media: 'wireless', speed: '1G' },
  ]),
  builtin('tpl_nas', 'NAS', 'nas', 'L3', copper(['eth0', 'eth1'])),
  builtin('tpl_ups', 'ИБП', 'ups', 'L1', copper(['mgmt'])),
];

export function createFromTemplate(template: DeviceTemplate | null, name: string): Device {
  const device = createDevice({
    name,
    kind: template?.kind ?? 'pc',
    attrs: {
      layer: template?.layer ?? 'L3',
      os: template?.os ?? '',
      role: template?.role ?? '',
      vendor: template?.vendor ?? '',
    },
    tags: template?.tags ? [...template.tags] : [],
  });
  if (template) {
    device.ports = template.ports.map((port) =>
      createPort({
        name: port.name,
        media: port.media,
        speed: port.speed,
        mode: port.mode,
        vlan: port.vlan,
        description: port.description ?? '',
      }),
    );
  }
  return device;
}

/** «Сохранить как шаблон»: копирует всё, что важно для повторного использования. */
export function templateFromDevice(device: Device, name: string): DeviceTemplate {
  return {
    id: `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    kind: device.kind,
    layer: device.attrs.layer ?? 'L3',
    os: device.attrs.os || undefined,
    role: device.attrs.role || undefined,
    vendor: device.attrs.vendor || undefined,
    tags: [...device.tags],
    ports: device.ports.map((port) => ({
      name: port.name,
      media: port.media,
      speed: port.speed,
      mode: port.mode,
      vlan: port.vlan ?? null,
      description: port.description || undefined,
    })),
    favorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function uniqueTemplateName(items: DeviceTemplate[], base: string): string {
  const used = new Set(items.map((item) => item.name.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; i < 10000; i++) {
    const candidate = `${base} ${i}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

/** Уникальное имя вида router-1, чтобы шаблоны не конфликтовали. */
export function uniqueDeviceName(doc: ProjectDocument, base = 'device'): string {
  const used = new Set(doc.devices.map((device) => device.name.toLowerCase()));
  for (let i = 1; i < 10000; i++) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return base;
}

/** «1 порт», «2 порта», «8 портов» — для карточек шаблонов. */
export function portsLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} порт`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} порта`;
  return `${count} портов`;
}
