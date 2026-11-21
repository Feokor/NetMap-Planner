import { describe, expect, it } from 'vitest';
import { csvToProject, parseCsv } from '../src/core/csv';

describe('импорт CSV', () => {
  it('разбирает кавычки, точки с запятой и переводы строк в поле', () => {
    const rows = parseCsv('name;role\n"core;1";"line ""quoted"""\nrouter;"multi\nline"');
    expect(rows).toEqual([
      ['name', 'role'],
      ['core;1', 'line "quoted"'],
      ['router', 'multi\nline'],
    ]);
  });

  it('собирает проект из экспортированной таблицы', () => {
    const csv = [
      'name;kind;layer;group;os;role;vendor;model;location;serial;ports;ips;tags',
      'ISP;router;L1;WAN;Linux;Border;Cisco;ISR4331;Rack 1;SN1;2;10.0.0.1/30 203.0.113.1/30;core wan',
      'HQ-FR;firewall;L2;HQ;AltLinux;Edge;Huawei;USG;Rack 2;SN2;1;10.0.0.2/24;fw',
    ].join('\r\n');

    const { doc, devices, groups } = csvToProject(csv, 'Офис');
    expect(doc.name).toBe('Офис');
    expect(devices).toBe(2);
    expect(groups).toBe(2);
    expect(doc.devices.map((device) => device.name)).toEqual(['ISP', 'HQ-FR']);

    const isp = doc.devices[0];
    expect(isp.kind).toBe('router');
    expect(isp.attrs.layer).toBe('L1');
    expect(isp.attrs.role).toBe('Border');
    expect(isp.tags).toEqual(['core', 'wan']);
    expect(isp.ports).toHaveLength(2);
    expect(isp.ports.flatMap((port) => port.ips.map((ip) => `${ip.address}/${ip.prefix}`))).toEqual([
      '10.0.0.1/30',
      '203.0.113.1/30',
    ]);
    expect(doc.groups.map((group) => group.name).sort()).toEqual(['HQ', 'WAN']);
  });

  it('понимает русские заголовки и запятые', () => {
    const csv = [
      'Имя,Тип,Группа,Адреса,Теги',
      'PC-1,ПК,Бухгалтерия,192.168.10.5/24,win офис',
    ].join('\n');

    const { doc } = csvToProject(csv);
    expect(doc.devices[0].name).toBe('PC-1');
    expect(doc.devices[0].kind).toBe('pc');
    expect(doc.devices[0].groupId).toBe(doc.groups[0].id);
    expect(doc.devices[0].tags).toEqual(['win', 'офис']);
    expect(doc.devices[0].ports[0].ips[0].address).toBe('192.168.10.5');
  });

  it('работает без строки заголовка', () => {
    const { doc } = csvToProject('SW-1;switch;L2');
    expect(doc.devices[0].name).toBe('SW-1');
    expect(doc.devices[0].kind).toBe('switch');
  });

  it('пропускает некорректные адреса и пустой CSV — ошибка', () => {
    const { doc } = csvToProject('name;ips\nA;not-an-ip 10.0.0.1/24');
    expect(doc.devices[0].ports[0].ips.map((ip) => ip.address)).toEqual(['10.0.0.1']);
    expect(() => csvToProject('   ')).toThrow();
  });
});
