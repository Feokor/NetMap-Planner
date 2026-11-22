import { describe, expect, it } from 'vitest';
import {
  createDevice,
  createIpAssignment,
  createPort,
  createProject,
  defaultDns,
  type Device,
  type ProjectDocument,
} from '../src/core/project';
import {
  commonPrefixOctets,
  deviceFqdn,
  dnsRecords,
  exportBind,
  normalizeDnsName,
  normalizeZoneName,
} from '../src/core/dns';

function withDevice(doc: ProjectDocument, device: Device): ProjectDocument {
  return { ...doc, devices: [...doc.devices, device] };
}

function deviceWithIps(name: string, addresses: string[], zoneId = 'dns_hq'): Device {
  const device = createDevice({ name });
  device.dnsZoneId = zoneId;
  device.ports = addresses.map((address, index) => {
    const [ip, prefixText] = address.split('/');
    return createPort({
      name: `eth${index}`,
      ips: [createIpAssignment(ip, Number(prefixText))],
    });
  });
  return device;
}

function sample(): ProjectDocument {
  const doc = createProject('DNS');
  return {
    ...doc,
    dns: {
      zones: [{ id: 'dns_hq', name: 'hq.example', default: true }],
      settings: { reverseMode: 'auto', reverseDepth: 2, ttl: 3600 },
    },
  };
}

describe('DNS-зоны', () => {
  it('нормализует имена и зоны', () => {
    expect(normalizeDnsName('  HQ RTR_1 ')).toBe('hq-rtr1');
    expect(normalizeDnsName('Шлюз №1')).toBe('shlyuz-1');
    expect(normalizeZoneName('HQ.Example.')).toBe('hq.example');
    expect(normalizeZoneName('не зона')).toBeNull();
  });

  it('строит FQDN по зоне по умолчанию', () => {
    const doc = sample();
    const device = deviceWithIps('HQ-RTR', ['192.168.1.1/24']);
    expect(deviceFqdn(doc, device)).toBe('hq-rtr.hq.example');
    device.dnsName = 'core';
    expect(deviceFqdn(doc, device)).toBe('core.hq.example');
  });

  it('генерирует A-записи и пропускает DHCP-пулы', () => {
    const doc = sample();
    const device = deviceWithIps('SRV', ['10.0.0.5/24', '10.0.0.6/24']);
    device.ports.push(
      createPort({
        name: 'pool',
        ips: [createIpAssignment('10.0.0.0', 24, 'dhcp')],
      }),
    );
    const records = dnsRecords(withDevice(doc, device));
    expect(records.forward).toHaveLength(2);
    expect(records.forward.map((item) => item.value)).toEqual(['10.0.0.5', '10.0.0.6']);
  });

  it('выбирает обратную зону по общему префиксу', () => {
    let doc = sample();
    doc = withDevice(doc, deviceWithIps('A', ['192.168.7.1/24']));
    doc = withDevice(doc, deviceWithIps('B', ['192.168.7.2/24']));
    let records = dnsRecords(doc);
    expect(records.depth).toBe(3);
    expect(records.reverse[0].name).toBe('7.168.192.in-addr.arpa');
    expect(records.reverse[0].records.map((item) => item.owner)).toEqual(['1', '2']);

    doc = withDevice(doc, deviceWithIps('C', ['192.168.8.5/24']));
    records = dnsRecords(doc);
    expect(records.depth).toBe(2);
    expect(records.reverse.map((zone) => zone.name).sort()).toEqual([
      '168.192.in-addr.arpa',
    ]);
  });

  it('уважает ручную глубину', () => {
    let doc = sample();
    doc.dns!.settings.reverseMode = 'manual';
    doc.dns!.settings.reverseDepth = 1;
    doc = withDevice(doc, deviceWithIps('A', ['192.168.7.1/24']));
    const records = dnsRecords(doc);
    expect(records.reverse[0].name).toBe('192.in-addr.arpa');
    expect(records.reverse[0].records[0].owner).toBe('1.7.168');
  });

  it('считает общий префикс октетов', () => {
    expect(commonPrefixOctets(['192.168.7.1', '192.168.7.2'])).toBe(3);
    expect(commonPrefixOctets(['192.168.7.1', '192.168.8.2'])).toBe(2);
    expect(commonPrefixOctets(['10.0.0.1', '192.168.0.1'])).toBe(0);
  });

  it('экспортирует BIND с прямыми и обратными записями', () => {
    let doc = sample();
    doc = withDevice(doc, deviceWithIps('HQ-RTR', ['192.168.7.1/24']));
    const text = exportBind(doc);
    expect(text).toContain('$ORIGIN hq.example.');
    expect(text).toContain('hq-rtr IN A 192.168.7.1');
    expect(text).toContain('$ORIGIN 7.168.192.in-addr.arpa.');
    expect(text).toContain('1 IN PTR hq-rtr.hq.example.');
    expect(text).toContain('@ IN SOA');
  });

  it('пустой проект экспортируется с пояснением', () => {
    const text = exportBind(createProject('Пусто'));
    expect(text).toContain('нет DNS-зон');
  });

  it('defaultDns даёт настройки по умолчанию', () => {
    expect(defaultDns().settings.reverseMode).toBe('auto');
    expect(defaultDns().zones).toEqual([]);
  });
});
