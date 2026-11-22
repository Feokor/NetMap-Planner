/**
 * Шаблоны устройств: типовые порты, слой и роль.
 * Пресет создаёт устройство с уже готовыми портами — остаётся назначить адреса.
 */

import {
  createDevice,
  createPort,
  type Device,
  type DeviceKind,
  type DeviceLayer,
  type PortMedia,
  type ProjectDocument,
} from './project';

export interface TemplatePort {
  name: string;
  media?: PortMedia;
  speed?: string;
}

export interface DeviceTemplate {
  /** Он же используется как база для имени: router-1, switch-2… */
  id: string;
  kind: DeviceKind;
  layer: DeviceLayer;
  ports: TemplatePort[];
}

const copper = (names: string[], speed = '1G'): TemplatePort[] =>
  names.map((name) => ({ name, media: 'copper', speed }));

export const DEVICE_TEMPLATES: DeviceTemplate[] = [
  {
    id: 'router',
    kind: 'router',
    layer: 'L3',
    ports: [
      { name: 'te0', media: 'fiber', speed: '10G' },
      { name: 'te1', media: 'fiber', speed: '10G' },
      ...copper(['gi0/0', 'gi0/1']),
    ],
  },
  {
    id: 'switch',
    kind: 'switch',
    layer: 'L2',
    ports: copper(['gi0/1', 'gi0/2', 'gi0/3', 'gi0/4', 'gi0/5', 'gi0/6', 'gi0/7', 'gi0/8']),
  },
  {
    id: 'firewall',
    kind: 'firewall',
    layer: 'L3',
    ports: copper(['wan', 'lan0', 'lan1', 'lan2']),
  },
  {
    id: 'server',
    kind: 'server',
    layer: 'L3',
    ports: copper(['ens18', 'ens19']),
  },
  {
    id: 'pc',
    kind: 'pc',
    layer: 'L3',
    ports: copper(['eth0']),
  },
  {
    id: 'ap',
    kind: 'ap',
    layer: 'L2',
    ports: [
      { name: 'eth0', media: 'copper', speed: '1G' },
      { name: 'wlan0', media: 'wireless', speed: '1G' },
    ],
  },
  {
    id: 'nas',
    kind: 'nas',
    layer: 'L3',
    ports: copper(['eth0', 'eth1']),
  },
  {
    id: 'ups',
    kind: 'ups',
    layer: 'L1',
    ports: copper(['mgmt']),
  },
];

export function createFromTemplate(template: DeviceTemplate | null, name: string): Device {
  const device = createDevice({
    name,
    kind: template?.kind ?? 'pc',
    attrs: { layer: template?.layer ?? 'L3' },
  });
  if (template) {
    device.ports = template.ports.map((port) =>
      createPort({ name: port.name, media: port.media, speed: port.speed }),
    );
  }
  return device;
}

/** Уникальное имя вида router-1, чтобы пресеты не конфликтовали. */
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
