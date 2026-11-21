import { describe, expect, it } from 'vitest';
import {
  SCHEMA,
  createBridge,
  createDevice,
  createIpAssignment,
  createPort,
  createProject,
  createDhcpPool,
  createVlan,
  deviceGroupIds,
  dhcpPools,
  errorCount,
  exportDocument,
  importAsNewProject,
  linkablePorts,
  memberPortIds,
  migrateDocument,
  projectCounts,
  searchDevices,
  setBridgeMembers,
  subnetOf,
  summarize,
  validateProject,
  type Device,
  type ProjectDocument,
} from '../src/core/project';
import {
  addIpBlock,
  blockUsage,
  nextFreeAnywhere,
  nextFreeInBlock,
  planOverview,
} from '../src/core/ipPlan';
import { parseAddress } from '../src/core/ip';

function withDevice(doc: ProjectDocument, device: Device): ProjectDocument {
  return { ...doc, devices: [...doc.devices, device] };
}

function deviceWithIp(name: string, ip: string, prefix = 24): Device {
  const device = createDevice({ name, kind: 'server' });
  device.ports = [createPort({ name: 'eth0', ips: [createIpAssignment(ip, prefix)] })];
  return device;
}

describe('модель проекта', () => {
  it('создаёт проект с двумя слоями и настройками по умолчанию', () => {
    const doc = createProject('Офис');
    expect(doc.schema).toBe(SCHEMA);
    expect(doc.name).toBe('Офис');
    expect(doc.layers.map((layer) => layer.kind)).toEqual(['annotation', 'structure']);
    expect(doc.layers[1].pinnedTop).toBe(true);
    expect(doc.settings.defaultView).toBe('list');
    expect(doc.devices).toEqual([]);
  });

  it('создаёт устройство с портом и IP', () => {
    const device = createDevice({ name: 'srv-1', kind: 'server' });
    expect(device.attrs.layer).toBe('L3');
    expect(device.ports).toHaveLength(1);
    const ip = createIpAssignment('10.0.0.5', 24, 'static');
    expect(ip.family).toBe(4);
    expect(ip.address).toBe('10.0.0.5');
  });

  it('считает сводку и элементы', () => {
    const doc = withDevice(createProject(), deviceWithIp('srv-1', '10.0.0.5'));
    const counts = projectCounts(doc);
    expect(counts).toMatchObject({ devices: 1, ports: 1, ips: 1, links: 0 });
    expect(summarize(doc).devices).toBe(1);
  });

  it('ищет по имени, IP и MAC', () => {
    const doc = withDevice(createProject(), deviceWithIp('srv-1', '10.0.0.5'));
    doc.devices[0].ports[0].mac = 'AA:BB:CC:DD:EE:FF';
    expect(searchDevices(doc, 'srv')).toHaveLength(1);
    expect(searchDevices(doc, '10.0.0.5')).toHaveLength(1);
    expect(searchDevices(doc, 'aa:bb')).toHaveLength(1);
    expect(searchDevices(doc, 'missing')).toHaveLength(0);
  });

  it('находит дубликаты IP и некорректные MAC', () => {
    let doc = createProject();
    doc = withDevice(doc, deviceWithIp('srv-1', '10.0.0.5'));
    doc = withDevice(doc, deviceWithIp('srv-2', '10.0.0.5'));
    doc.devices[0].ports[0].mac = 'not-a-mac';

    const issues = validateProject(doc);
    expect(errorCount(issues)).toBeGreaterThanOrEqual(2);
    expect(issues.some((issue) => issue.message.includes('Дубликат IP'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('Некорректный MAC'))).toBe(true);
  });

  it('замечает совпадающие имена и битые связи', () => {
    let doc = createProject();
    doc = withDevice(doc, deviceWithIp('srv', '10.0.0.5'));
    doc = withDevice(doc, deviceWithIp('srv', '10.0.0.6'));
    doc.links.push({
      id: 'l1',
      a: { deviceId: doc.devices[0].id, portId: doc.devices[0].ports[0].id },
      b: { deviceId: 'missing', portId: null },
      media: 'copper',
    });
    const issues = validateProject(doc);
    expect(issues.some((issue) => issue.message.includes('встречается 2 раза'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('удалённое устройство'))).toBe(true);
  });

  it('проверяет блоки плана и адреса вне блоков', () => {
    let doc = createProject();
    doc = addIpBlock(doc, '10.0.0.0/24', 'Офис');
    doc = addIpBlock(doc, '10.0.0.128/25', 'Пересечение');
    doc = withDevice(doc, deviceWithIp('srv', '192.168.1.5'));

    const issues = validateProject(doc);
    expect(issues.some((issue) => issue.message.includes('пересекаются'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('не входит ни в один блок'))).toBe(true);
  });

  it('не считает ошибкой адрес внутри блока', () => {
    let doc = createProject();
    doc = addIpBlock(doc, '10.0.0.0/24', 'Офис');
    doc = withDevice(doc, deviceWithIp('srv', '10.0.0.5'));
    const issues = validateProject(doc);
    expect(issues.filter((issue) => issue.level === 'error')).toHaveLength(0);
    expect(issues.some((issue) => issue.message.includes('не входит'))).toBe(false);
  });
});

describe('импорт и экспорт', () => {
  it('переживает сериализацию без потерь', () => {
    let doc = createProject('Экспорт');
    doc = withDevice(doc, deviceWithIp('srv', '10.0.0.5'));
    const restored = migrateDocument(JSON.parse(exportDocument(doc)));
    expect(restored.name).toBe('Экспорт');
    expect(restored.devices).toHaveLength(1);
    expect(restored.devices[0].ports[0].ips[0].address).toBe('10.0.0.5');
  });

  it('импортирует как новый проект с новым id', () => {
    const doc = createProject('Копия');
    const copy = importAsNewProject(JSON.parse(exportDocument(doc)));
    expect(copy.id).not.toBe(doc.id);
    expect(copy.name).toBe('Копия');
  });

  it('достраивает недостающие поля', () => {
    const restored = migrateDocument({
      schema: SCHEMA,
      name: 'Минимум',
      devices: [{ id: 'd1', name: 'srv', kind: 'server', ports: [] }],
    });
    expect(restored.layers.length).toBeGreaterThan(0);
    expect(restored.devices[0].attrs).toBeDefined();
    expect(restored.devices[0].tags).toEqual([]);
    expect(restored.settings.defaultView).toBe('list');
  });

  it('отклоняет чужую схему', () => {
    expect(() => migrateDocument({ schema: 'other/v1' })).toThrow(/схем/i);
    expect(() => migrateDocument(null)).toThrow();
    expect(() => migrateDocument('x')).toThrow();
  });
});

describe('план адресов', () => {
  it('считает занятость блока', () => {
    let doc = createProject();
    doc = addIpBlock(doc, '10.0.0.0/24', 'Офис');
    doc = withDevice(doc, deviceWithIp('srv-1', '10.0.0.1'));
    doc = withDevice(doc, deviceWithIp('srv-2', '10.0.0.2'));

    const usage = blockUsage(doc, doc.ipPlan.blocks[0])!;
    expect(usage.used).toBe(2n);
    expect(usage.usable).toBe(254n);
    expect(usage.percent).toBeCloseTo((2 / 254) * 100, 5);
    expect(usage.assigned.map((ref) => ref.text)).toEqual(['10.0.0.1', '10.0.0.2']);
    expect(usage.free.length).toBeGreaterThan(0);
  });

  it('выдаёт первый свободный адрес, пропуская занятые и зарезервированные', () => {
    let doc = createProject();
    doc = addIpBlock(doc, '10.0.0.0/24', 'Офис');

    expect(nextFreeInBlock(doc, doc.ipPlan.blocks[0])?.address).toBe('10.0.0.1');

    doc = withDevice(doc, deviceWithIp('srv-1', '10.0.0.1'));
    expect(nextFreeInBlock(doc, doc.ipPlan.blocks[0])?.address).toBe('10.0.0.2');

    doc = withDevice(doc, deviceWithIp('srv-2', '10.0.0.3'));
    expect(nextFreeInBlock(doc, doc.ipPlan.blocks[0])?.address).toBe('10.0.0.2');

    doc = withDevice(doc, deviceWithIp('srv-3', '10.0.0.2'));
    expect(nextFreeInBlock(doc, doc.ipPlan.blocks[0])?.address).toBe('10.0.0.4');
  });

  it('работает с /31 и /32', () => {
    let doc = createProject();
    doc = addIpBlock(doc, '10.0.0.0/31', 'P2P');
    expect(nextFreeInBlock(doc, doc.ipPlan.blocks[0])?.address).toBe('10.0.0.0');
    doc = withDevice(doc, deviceWithIp('a', '10.0.0.0', 31));
    expect(nextFreeInBlock(doc, doc.ipPlan.blocks[0])?.address).toBe('10.0.0.1');
    doc = withDevice(doc, deviceWithIp('b', '10.0.0.1', 31));
    expect(nextFreeInBlock(doc, doc.ipPlan.blocks[0])).toBeNull();

    let single = createProject();
    single = addIpBlock(single, '10.0.0.7/32', 'Host route');
    expect(nextFreeInBlock(single, single.ipPlan.blocks[0])?.address).toBe('10.0.0.7');
  });

  it('выдаёт свободный адрес в IPv6 без перебора', () => {
    let doc = createProject();
    doc = addIpBlock(doc, '2001:db8::/64', 'Офис');
    const first = nextFreeInBlock(doc, doc.ipPlan.blocks[0])!;
    expect(first.address).toBe('2001:db8::1');
    expect(first.candidates).toBe((1n << 64n) - 1n);

    doc = withDevice(doc, deviceWithIp('v6', first.address, 64));
    expect(nextFreeInBlock(doc, doc.ipPlan.blocks[0])?.address).toBe('2001:db8::2');
  });

  it('выдаёт null, когда блок заполнен', () => {
    let doc = createProject();
    doc = addIpBlock(doc, '10.0.0.0/30', 'Точка-точка');
    doc = withDevice(doc, deviceWithIp('a', '10.0.0.1', 30));
    doc = withDevice(doc, deviceWithIp('b', '10.0.0.2', 30));
    expect(nextFreeInBlock(doc, doc.ipPlan.blocks[0])).toBeNull();
    expect(nextFreeAnywhere(doc)).toBeNull();
  });

  it('считает общую сводку плана и адреса вне плана', () => {
    let doc = createProject();
    doc = addIpBlock(doc, '10.0.0.0/24', 'Офис');
    doc = addIpBlock(doc, '10.0.1.0/24', 'Серверная');
    doc = withDevice(doc, deviceWithIp('inside', '10.0.0.5'));
    doc = withDevice(doc, deviceWithIp('outside', '192.168.5.5'));

    const overview = planOverview(doc);
    expect(overview.blocks).toHaveLength(2);
    expect(overview.totals.blocks).toBe(2);
    expect(overview.totals.capacity).toBe(512n);
    expect(overview.totals.usable).toBe(508n);
    expect(overview.totals.used).toBe(1n);
    expect(overview.totals.unplanned).toBe(1);
  });
});

describe('подсети, группы и резервные адреса', () => {  it('вычисляет подсеть и последний адрес', () => {
    const info = subnetOf(4, parseAddress('192.168.1.130').address, 24);
    expect(info.networkText).toBe('192.168.1.0/24');
    expect(info.last).toBe(BigInt('3232236031')); // 192.168.1.255
  });

  it('объединяет основной groupId и дополнительные группы', () => {
    const device = createDevice({ groupId: 'g1', groupIds: ['g2', 'g1'] });
    expect(deviceGroupIds(device)).toEqual(['g1', 'g2']);
    expect(deviceGroupIds(createDevice({ groupIds: ['g3'] }))).toEqual(['g3']);
  });

  it('предупреждает об адресе сети и широковещательном адресе', () => {
    let doc = createProject();
    doc = withDevice(doc, deviceWithIp('net', '10.0.0.0'));
    doc = withDevice(doc, deviceWithIp('bcast', '10.0.0.255'));
    const issues = validateProject(doc);
    expect(issues.some((issue) => issue.message.includes('адрес сети'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('широковещательный'))).toBe(true);
  });

  it('не считает адрес сети ошибкой для /31 и /32', () => {
    let doc = createProject();
    doc = withDevice(doc, deviceWithIp('p2p', '10.0.0.0', 31));
    doc = withDevice(doc, deviceWithIp('loop', '10.0.0.5', 32));
    const issues = validateProject(doc);
    expect(issues.some((issue) => issue.message.includes('адрес сети'))).toBe(false);
  });

  it('разрешает одинаковый VIP на нескольких устройствах', () => {
    let doc = createProject();
    const a = createDevice({ name: 'a' });
    a.ports = [createPort({ name: 'eth0', ips: [createIpAssignment('10.0.0.9', 24, 'vip')] })];
    const b = createDevice({ name: 'b' });
    b.ports = [createPort({ name: 'eth0', ips: [createIpAssignment('10.0.0.9', 24, 'vip')] })];
    doc = withDevice(doc, a);
    doc = withDevice(doc, b);
    const issues = validateProject(doc);
    expect(issues.some((issue) => issue.message.includes('Дубликат IP'))).toBe(false);
  });
});

describe('мосты и логические порты', () => {
  function deviceWithPorts(names: string[]): Device {
    const device = createDevice({ name: 'srv' });
    device.ports = names.map((name) => createPort({ name }));
    return device;
  }

  it('объединяет несколько физических портов в br0', () => {
    const device = deviceWithPorts(['ens34', 'ens35', 'ens36']);
    const ids = device.ports.map((port) => port.id);
    const bridged = createBridge(device, ids);
    const bridge = bridged.ports.find((port) => port.kind === 'bridge');
    expect(bridge?.name).toBe('br0');
    expect(bridge?.members).toEqual(ids);
    expect(linkablePorts(bridged).map((port) => port.name)).toEqual([
      'ens34',
      'ens35',
      'ens36',
      'br0',
    ]);
    expect([...memberPortIds(bridged)].sort()).toEqual([...ids].sort());
  });

  it('переносит порт из старого моста и удаляет опустевший мост', () => {
    let device = deviceWithPorts(['ens34', 'ens35', 'ens36']);
    const [a, b, c] = device.ports.map((port) => port.id);
    device = createBridge(device, [a, b]);
    expect(device.ports.filter((port) => port.kind === 'bridge')).toHaveLength(1);

    device = createBridge(device, [a, c], 'br1');
    const bridges = device.ports.filter((port) => port.kind === 'bridge');
    expect(bridges.map((port) => port.name).sort()).toEqual(['br0', 'br1']);
    const br0 = bridges.find((port) => port.name === 'br0');
    const br1 = bridges.find((port) => port.name === 'br1');
    expect(br0?.members).toEqual([b]);
    expect(br1?.members).toEqual([a, c]);
  });

  it('меняет состав участников моста', () => {
    let device = deviceWithPorts(['ens34', 'ens35', 'ens36']);
    const [a, b, c] = device.ports.map((port) => port.id);
    device = createBridge(device, [a, b]);
    const bridge = device.ports.find((port) => port.kind === 'bridge')!;
    device = setBridgeMembers(device, bridge.id, [b, c]);
    expect(device.ports.find((port) => port.id === bridge.id)?.members).toEqual([b, c]);
  });

  it('создаёт VLAN-сабинтерфейс под портом и не мешает мосту', () => {
    let device = deviceWithPorts(['te1', 'te2']);
    const [te1, te2] = device.ports.map((port) => port.id);
    device = createVlan(device, te1, 10);
    device = createVlan(device, te1, 20);
    const vlans = device.ports.filter((port) => port.kind === 'vlan');
    expect(vlans.map((port) => port.name)).toEqual(['te1.10', 'te1.20']);
    expect(vlans.every((port) => port.members?.[0] === te1)).toBe(true);

    // Повторный VLAN с тем же номером не создаётся.
    const again = createVlan(device, te1, 10);
    expect(again.ports.filter((port) => port.kind === 'vlan')).toHaveLength(2);
    // VLAN-порт нельзя выбрать как физическую связь.
    expect(linkablePorts(device).some((port) => port.kind === 'vlan')).toBe(false);

    // Мост забирает te2, но VLAN на te1 остаются.
    device = createBridge(device, [te2]);
    expect(device.ports.filter((port) => port.kind === 'vlan')).toHaveLength(2);
  });

  it('предупреждает об IP на порту-участнике и не считает связи моста ошибкой', () => {
    let device = deviceWithPorts(['ens34', 'ens35']);
    const [a, b] = device.ports.map((port) => port.id);
    device.ports = device.ports.map((port) =>
      port.id === a
        ? { ...port, ips: [createIpAssignment('10.0.0.10', 24)] }
        : port,
    );
    device = createBridge(device, [a, b]);
    let doc = createProject();
    doc = withDevice(doc, device);
    doc = {
      ...doc,
      links: [
        {
          id: 'lnk1',
          a: { deviceId: device.id, portId: a },
          b: { deviceId: device.id, portId: b },
          media: 'copper',
          label: '',
          points: [],
        },
      ],
    };
    const issues = validateProject(doc);
    expect(issues.some((issue) => issue.message.includes('есть IP'))).toBe(true);
    // Связи через порты-участники принадлежат мосту: предупреждения «перенесите на br0» больше нет.
    expect(issues.some((issue) => issue.message.includes('подключение лучше перенести'))).toBe(false);
  });
});

describe('DHCP-пулы', () => {
  function deviceWithPool(name: string, cidr: string, prefix = 24): Device {
    const device = createDevice({ name, kind: 'router' });
    const ip = createIpAssignment(cidr, prefix, 'dhcp');
    device.ports = [createPort({ name: 'eth0', ips: [ip] })];
    return device;
  }

  it('собирает пулы и нормализует адрес сети', () => {
    let doc = createProject();
    doc = withDevice(doc, deviceWithPool('r1', '10.0.10.0'));
    const pools = dhcpPools(doc);
    expect(pools).toHaveLength(1);
    expect(pools[0].text).toBe('10.0.10.0/24');
    expect(pools[0].usable).toBe(254n);
    expect(pools[0].normalized).toBe(true);
  });

  it('не считает пул занятым адресом в плане', () => {
    let doc = createProject();
    doc = withDevice(doc, deviceWithPool('r1', '10.0.10.0'));
    doc = addIpBlock(doc, '10.0.10.0/24', 'LAN');
    const usage = blockUsage(doc, doc.ipPlan.blocks[0]);
    expect(usage?.used).toBe(0n);
    expect(nextFreeInBlock(doc, doc.ipPlan.blocks[0])?.address).toBe('10.0.10.1');
  });

  it('ругается на пересечение пулов и статические адреса внутри пула', () => {
    let doc = createProject();
    doc = withDevice(doc, deviceWithPool('r1', '10.0.10.0'));
    doc = withDevice(doc, deviceWithPool('r2', '10.0.10.128', 25));
    doc = withDevice(doc, deviceWithIp('srv', '10.0.10.50'));
    const issues = validateProject(doc);
    expect(issues.some((issue) => issue.level === 'error' && issue.message.includes('пересекаются'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('со статическими адресами'))).toBe(true);
  });

  it('сужает диапазон выдачи и показывает только его хосты', () => {
    const device = createDevice({ name: 'r1', kind: 'router' });
    const ip = createIpAssignment('10.0.10.0', 24, 'dhcp');
    ip.poolFrom = '10.0.10.10';
    ip.poolTo = '10.0.10.20';
    device.ports = [createPort({ name: 'eth0', ips: [ip] })];
    let doc = withDevice(createProject(), device);
    doc = withDevice(doc, deviceWithIp('srv', '10.0.10.15'));
    const pool = dhcpPools(doc)[0];
    expect(pool.rangeCustom).toBe(true);
    expect(pool.rangeInvalid).toBe(false);
    expect(pool.usable).toBe(11n);
    expect(pool.rangeText).toBe('10.0.10.10 – 10.0.10.20');
    expect(pool.inside.map((ref) => ref.text)).toEqual(['10.0.10.15']);
    expect(validateProject(doc).some((issue) => issue.message.includes('пересекается со статическими'))).toBe(true);
  });

  it('сообщает о неверном диапазоне выдачи', () => {
    const device = createDevice({ name: 'r1', kind: 'router' });
    const ip = createIpAssignment('10.0.10.0', 24, 'dhcp');
    ip.poolFrom = '10.0.10.200';
    ip.poolTo = '10.0.10.10';
    device.ports = [createPort({ name: 'eth0', ips: [ip] })];
    const doc = withDevice(createProject(), device);
    const pool = dhcpPools(doc)[0];
    expect(pool.rangeInvalid).toBe(true);
    expect(pool.rangeCustom).toBe(false);
    expect(validateProject(doc).some((issue) => issue.level === 'error' && issue.message.includes('диапазон выдачи'))).toBe(true);
  });

  it('создаёт пул из блока плана с ручным диапазоном', () => {
    let doc = createProject();
    doc = withDevice(doc, createDevice({ name: 'r1', kind: 'router', ports: [createPort({ name: 'eth0' })] }));
    doc = addIpBlock(doc, '10.0.20.0/24', 'LAN');
    const block = doc.ipPlan.blocks[0];
    const device = doc.devices[0];
    doc = createDhcpPool(doc, {
      blockId: block.id,
      deviceId: device.id,
      portId: device.ports[0].id,
      from: '10.0.20.100',
      to: '10.0.20.150',
    });
    const pool = dhcpPools(doc)[0];
    expect(pool.text).toBe('10.0.20.0/24');
    expect(pool.rangeCustom).toBe(true);
    expect(pool.usable).toBe(51n);
    expect(pool.rangeText).toBe('10.0.20.100 – 10.0.20.150');
  });

  it('сохраняет ручные группы подсетей при импорте', () => {
    const doc = createProject();
    doc.ipPlan.groups = [
      { id: 'ipg_1', name: 'Офис', parentId: null, blockIds: [] },
      { id: 'ipg_2', name: 'Бухгалтерия', parentId: 'ipg_1', blockIds: [] },
    ];
    const imported = importAsNewProject(JSON.parse(exportDocument(doc)));
    expect(imported.ipPlan.groups).toHaveLength(2);
    expect(imported.ipPlan.groups?.[1].parentId).toBe('ipg_1');
  });
});
