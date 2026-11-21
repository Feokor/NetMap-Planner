import { describe, expect, it } from 'vitest';
import { IpError, formatIPv4, formatIPv6, parseCidr, parseIPv4 } from '../src/core/ip';
import {
  type Block,
  blockContains,
  blockLast,
  blockToString,
  blocksOverlap,
  bitFloor,
  firstFreeBlock,
  freeBlocks,
  hostRoleAt,
  hostsPage,
  makeBlock,
  planSubnetSplit,
  pow2Ceil,
  prefixForSubnetCount,
  rangeToCidrs,
  splitBlockPage,
  subnetCount,
  subnetCountForRequest,
  totalCapacity,
  usableRange,
} from '../src/core/subnet';

const b4 = (cidr: string): Block => {
  const p = parseCidr(cidr);
  return makeBlock(p.family, p.address, p.prefix);
};
const b6 = (cidr: string): Block => {
  const p = parseCidr(cidr);
  return makeBlock(p.family, p.address, p.prefix);
};

describe('блоки', () => {
  it('нормализует сетевой адрес', () => {
    expect(blockToString(makeBlock(4, parseIPv4('10.1.2.3'), 24))).toBe('10.1.2.0/24');
    expect(blockToString(b6('2001:db8::dead:beef/48'))).toBe('2001:db8::/48');
  });

  it('содержит адреса и пересекается', () => {
    const block = b4('192.168.0.0/16');
    expect(blockContains(block, parseIPv4('192.168.255.255'))).toBe(true);
    expect(blockContains(block, parseIPv4('192.169.0.0'))).toBe(false);
    expect(blocksOverlap(b4('10.0.0.0/8'), b4('10.1.0.0/16'))).toBe(true);
    expect(blocksOverlap(b4('10.0.0.0/9'), b4('10.128.0.0/9'))).toBe(false);
    expect(blocksOverlap(b4('10.0.0.0/8'), b6('::/0'))).toBe(false);
  });

  it('границы блока', () => {
    expect(formatIPv4(blockLast(b4('10.0.0.0/24')))).toBe('10.0.0.255');
    expect(formatIPv4(blockLast(b4('0.0.0.0/0')))).toBe('255.255.255.255');
    expect(formatIPv6(blockLast(b6('2001:db8::/32')))).toBe(
      '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
    );
  });
});

describe('разбиение на подсети', () => {
  it('считает количество подсетей', () => {
    expect(subnetCount(b4('10.0.0.0/16'), 24)).toBe(256n);
    expect(subnetCount(b4('10.0.0.0/24'), 24)).toBe(1n);
    expect(subnetCount(b6('2001:db8::/32'), 48)).toBe(65536n);
    expect(subnetCount(b6('::/0'), 64)).toBe(18446744073709551616n);
    expect(() => subnetCount(b4('10.0.0.0/24'), 16)).toThrow(IpError);
  });

  it('отдаёт страницу подсетей IPv4', () => {
    const page = splitBlockPage(b4('10.0.0.0/16'), 24, 10n, 3);
    expect(page.map(blockToString)).toEqual(['10.0.10.0/24', '10.0.11.0/24', '10.0.12.0/24']);
    expect(splitBlockPage(b4('10.0.0.0/24'), 24, 0n, 5).length).toBe(1);
    expect(splitBlockPage(b4('10.0.0.0/24'), 24, 1n, 5)).toEqual([]);
  });

  it('отдаёт страницу подсетей IPv6 без перебора', () => {
    const page = splitBlockPage(b6('::/0'), 64, 5n, 2);
    expect(page.map(blockToString)).toEqual(['0:0:0:5::/64', '0:0:0:6::/64']);
    const last = splitBlockPage(b6('::/0'), 64, (1n << 64n) - 1n, 1);
    expect(last[0].address).toBe((1n << 64n) - 1n << 64n);
  });
});

describe('деление на N подсетей', () => {
  it('N=2: удваивает количество, префикс +1', () => {
    const block = b4('192.168.0.0/24');
    expect(prefixForSubnetCount(block, 2)).toBe(25);
    expect(subnetCountForRequest(block, 2)).toBe(2n);
    expect(planSubnetSplit(block, 2)).toMatchObject({ prefix: 25, clipped: false });
    expect(splitBlockPage(block, 25, 0n, 4).map(blockToString)).toEqual([
      '192.168.0.0/25',
      '192.168.0.128/25',
    ]);
  });

  it('N=5: округляет вверх до 8 подсетей (/24 → /27)', () => {
    const block = b4('192.168.0.0/24');
    expect(prefixForSubnetCount(block, 5)).toBe(27);
    expect(subnetCountForRequest(block, 5)).toBe(8n);
    expect(planSubnetSplit(block, 5)).toEqual({
      prefix: 27,
      count: 8n,
      requested: 5n,
      clipped: false,
    });
    expect(splitBlockPage(block, 27, 0n, 8)).toHaveLength(8);
  });

  it('N=8: степень двойки не округляется', () => {
    const block = b4('10.0.0.0/16');
    expect(prefixForSubnetCount(block, 8)).toBe(19);
    expect(subnetCountForRequest(block, 8)).toBe(8n);
    expect(planSubnetSplit(block, 8).clipped).toBe(false);
  });

  it('N больше максимума: обрезает по /32', () => {
    const block = b4('192.168.0.0/24');
    expect(prefixForSubnetCount(block, 1000)).toBe(32);
    expect(subnetCountForRequest(block, 1000)).toBe(256n);
    expect(planSubnetSplit(block, 1000)).toMatchObject({
      prefix: 32,
      count: 256n,
      clipped: true,
    });

    const small = b4('10.0.0.0/30');
    expect(prefixForSubnetCount(small, 100)).toBe(32);
    expect(subnetCountForRequest(small, 100)).toBe(4n);
    expect(planSubnetSplit(small, 100).clipped).toBe(true);
  });

  it('N=1: префикс и подсеть не меняются', () => {
    const block = b4('172.16.0.0/12');
    expect(prefixForSubnetCount(block, 1)).toBe(12);
    expect(subnetCountForRequest(block, 1)).toBe(1n);
    expect(planSubnetSplit(block, 1)).toEqual({
      prefix: 12,
      count: 1n,
      requested: 1n,
      clipped: false,
    });

    const single = b4('10.0.0.7/32');
    expect(prefixForSubnetCount(single, 1)).toBe(32);
    expect(subnetCountForRequest(single, 1)).toBe(1n);
    expect(planSubnetSplit(single, 2)).toMatchObject({ prefix: 32, count: 1n, clipped: true });
  });

  it('IPv6: /48 и N=4 → /50', () => {
    const block = b6('2001:db8::/48');
    expect(prefixForSubnetCount(block, 4)).toBe(50);
    expect(subnetCountForRequest(block, 4)).toBe(4n);
    expect(splitBlockPage(block, 50, 0n, 4).map(blockToString)).toEqual([
      '2001:db8::/50',
      '2001:db8:0:4000::/50',
      '2001:db8:0:8000::/50',
      '2001:db8:0:c000::/50',
    ]);

    const huge = b6('::/0');
    expect(prefixForSubnetCount(huge, 4)).toBe(2);
    expect(subnetCountForRequest(huge, (1n << 40n) + 1n)).toBe(1n << 41n);
    expect(planSubnetSplit(huge, (1n << 40n) + 1n).prefix).toBe(41);
  });

  it('степень двойки для количества', () => {
    expect(pow2Ceil(1n)).toBe(1n);
    expect(pow2Ceil(2n)).toBe(2n);
    expect(pow2Ceil(5n)).toBe(8n);
    expect(pow2Ceil(256n)).toBe(256n);
    expect(pow2Ceil(257n)).toBe(512n);
    expect(pow2Ceil(1n << 64n)).toBe(1n << 64n);
  });
});

describe('хосты', () => {
  it('/24: сеть, хосты, broadcast', () => {
    const page = hostsPage(b4('192.168.1.0/24'), 0n, 3);
    expect(page.map((row) => [formatIPv4(row.address), row.role, row.usable])).toEqual([
      ['192.168.1.0', 'network', false],
      ['192.168.1.1', 'host', true],
      ['192.168.1.2', 'host', true],
    ]);
    const tail = hostsPage(b4('192.168.1.0/24'), 253n, 10);
    expect(tail).toHaveLength(3);
    expect(tail[2]).toMatchObject({ role: 'broadcast', usable: false });
    expect(formatIPv4(tail[2].address)).toBe('192.168.1.255');
  });

  it('/31: обе точки назначаемые (RFC 3021)', () => {
    const page = hostsPage(b4('10.0.0.0/31'), 0n, 10);
    expect(page.map((row) => row.role)).toEqual(['point-to-point', 'point-to-point']);
    expect(page.every((row) => row.usable)).toBe(true);
  });

  it('/32: единственный адрес', () => {
    const page = hostsPage(b4('10.0.0.7/32'), 0n, 10);
    expect(page).toHaveLength(1);
    expect(page[0]).toMatchObject({ role: 'single', usable: true });
  });

  it('/0: страницы считаются формулами', () => {
    const page = hostsPage(b4('0.0.0.0/0'), 4294967294n, 5);
    expect(page).toHaveLength(2);
    expect(formatIPv4(page[0].address)).toBe('255.255.255.254');
    expect(formatIPv4(page[1].address)).toBe('255.255.255.255');
    expect(page[1].role).toBe('broadcast');
  });

  it('IPv6: anycast вместо сети, без broadcast', () => {
    const page = hostsPage(b6('2001:db8::/126'), 0n, 4);
    expect(page.map((row) => row.role)).toEqual(['anycast', 'host', 'host', 'host']);
    const last = hostsPage(b6('2001:db8::/126'), 3n, 1)[0];
    expect(formatIPv6(last.address)).toBe('2001:db8::3');
    expect(last.usable).toBe(true);
  });

  it('роли на границах', () => {
    const block = b4('10.0.0.0/30');
    expect(hostRoleAt(block, 0n).role).toBe('network');
    expect(hostRoleAt(block, 1n).role).toBe('host');
    expect(hostRoleAt(block, 2n).role).toBe('host');
    expect(hostRoleAt(block, 3n).role).toBe('broadcast');
    expect(hostsPage(block, 4n, 1)).toEqual([]);
  });

  it('диапазон назначаемых адресов', () => {
    const range = usableRange(b4('10.0.0.0/24'))!;
    expect(formatIPv4(range.first)).toBe('10.0.0.1');
    expect(formatIPv4(range.last)).toBe('10.0.0.254');

    const p2p = usableRange(b4('10.0.0.0/31'))!;
    expect(formatIPv4(p2p.first)).toBe('10.0.0.0');
    expect(formatIPv4(p2p.last)).toBe('10.0.0.1');

    const single = usableRange(b4('10.0.0.7/32'))!;
    expect(single.first).toBe(single.last);

    const v6 = usableRange(b6('2001:db8::/64'))!;
    expect(formatIPv6(v6.first)).toBe('2001:db8::1');
    expect(formatIPv6(v6.last)).toBe('2001:db8::ffff:ffff:ffff:ffff');
  });
});

describe('диапазоны и свободное пространство', () => {
  it('разбивает диапазон на CIDR', () => {
    const blocks = rangeToCidrs(4, parseIPv4('10.0.0.1'), parseIPv4('10.0.0.6'));
    expect(blocks.map(blockToString)).toEqual([
      '10.0.0.1/32',
      '10.0.0.2/31',
      '10.0.0.4/31',
      '10.0.0.6/32',
    ]);
    expect(rangeToCidrs(4, parseIPv4('10.0.0.0'), parseIPv4('10.0.0.255')).map(blockToString)).toEqual([
      '10.0.0.0/24',
    ]);
    expect(rangeToCidrs(4, 5n, 1n)).toEqual([]);
  });

  it('находит свободные блоки', () => {
    const free = freeBlocks(b4('10.0.0.0/24'), [b4('10.0.0.0/26'), b4('10.0.0.192/26')]);
    expect(free.map(blockToString)).toEqual(['10.0.0.64/26', '10.0.0.128/26']);
  });

  it('сливает пересечения и игнорирует чужие диапазоны', () => {
    const free = freeBlocks(b4('10.0.0.0/24'), [
      b4('10.0.0.0/25'),
      b4('10.0.0.64/26'),
      b4('192.168.0.0/16'),
      b6('::/0'),
    ]);
    expect(free.map(blockToString)).toEqual(['10.0.0.128/25']);
  });

  it('всё занято — свободного нет', () => {
    expect(freeBlocks(b4('10.0.0.0/24'), [b4('10.0.0.0/8')])).toEqual([]);
    expect(firstFreeBlock(b4('10.0.0.0/24'), [b4('10.0.0.0/24')], 26)).toBeNull();
  });

  it('находит первый свободный блок нужного размера', () => {
    const superblock = b4('10.0.0.0/24');
    expect(blockToString(firstFreeBlock(superblock, [b4('10.0.0.0/25')], 26)!)).toBe('10.0.0.128/26');
    expect(blockToString(firstFreeBlock(superblock, [b4('10.0.0.128/26')], 26)!)).toBe('10.0.0.0/26');
    expect(blockToString(firstFreeBlock(superblock, [b4('10.0.0.64/26')], 26)!)).toBe('10.0.0.0/26');
    expect(firstFreeBlock(superblock, [b4('10.0.0.0/25')], 24)).toBeNull();
    expect(() => firstFreeBlock(b4('10.0.0.0/24'), [], 16)).toThrow(IpError);
  });

  it('IPv6: свободное пространство считается без перебора', () => {
    const superblock = b6('2001:db8::/32');
    const free = freeBlocks(superblock, [b6('2001:db8::/48')]);
    expect(free.map(blockToString)).toEqual(['2001:db8:1::/48', '2001:db8:2::/47', '2001:db8:4::/46',
      '2001:db8:8::/45', '2001:db8:10::/44', '2001:db8:20::/43', '2001:db8:40::/42',
      '2001:db8:80::/41', '2001:db8:100::/40', '2001:db8:200::/39', '2001:db8:400::/38',
      '2001:db8:800::/37', '2001:db8:1000::/36', '2001:db8:2000::/35', '2001:db8:4000::/34',
      '2001:db8:8000::/33']);
  });

  it('суммарная ёмкость', () => {
    expect(totalCapacity([b4('10.0.0.0/24'), b4('10.0.1.0/24')])).toBe(512n);
    expect(bitFloor(8n)).toBe(3);
    expect(bitFloor(1n)).toBe(0);
  });
});
