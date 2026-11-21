import { describe, expect, it } from 'vitest';
import {
  IpError,
  classOfV4,
  classifyAddress,
  classfulPrefix,
  eui64LinkLocal,
  formatIPv4,
  formatIPv6,
  fromBitString,
  humanCount,
  maskV4FromPrefix,
  networkOf,
  lastOf,
  parseAddress,
  parseCidr,
  parseIPv4,
  parseIPv6,
  prefixFromMask,
  reverseDns,
  specialRanges,
  toBitString,
  totalCount,
  usableCount,
  wildcardFromPrefix,
  groupDigits,
} from '../src/core/ip';

describe('IPv4 parse/format', () => {
  it('разбирает и форматирует обычный адрес', () => {
    expect(parseIPv4('192.168.1.10')).toBe(0xc0a8010an);
    expect(formatIPv4(0xc0a8010an)).toBe('192.168.1.10');
  });

  it('обрабатывает границы 0.0.0.0 и 255.255.255.255', () => {
    expect(parseIPv4('0.0.0.0')).toBe(0n);
    expect(parseIPv4('255.255.255.255')).toBe(4294967295n);
    expect(formatIPv4(0n)).toBe('0.0.0.0');
    expect(formatIPv4(4294967295n)).toBe('255.255.255.255');
  });

  it('отбраковывает некорректные записи', () => {
    expect(() => parseIPv4('1.2.3')).toThrow(IpError);
    expect(() => parseIPv4('1.2.3.4.5')).toThrow(IpError);
    expect(() => parseIPv4('1.2.3.256')).toThrow(IpError);
    expect(() => parseIPv4('1.2.3.010')).toThrow(/Ведущий ноль/);
    expect(() => parseIPv4('')).toThrow(IpError);
    expect(() => parseIPv4('1.2.3.a')).toThrow(IpError);
  });

  it('узнаёт семейство автоматически', () => {
    expect(parseAddress('10.0.0.1')).toEqual({ family: 4, address: 167772161n });
    expect(parseAddress('::1')).toEqual({ family: 6, address: 1n });
  });
});

describe('IPv6 parse/format', () => {
  it('форматирует по RFC 5952', () => {
    expect(formatIPv6(parseIPv6('::'))).toBe('::');
    expect(formatIPv6(parseIPv6('::1'))).toBe('::1');
    expect(formatIPv6(parseIPv6('2001:0db8:0000:0000:0000:ff00:0042:8329'))).toBe(
      '2001:db8::ff00:42:8329',
    );
    expect(formatIPv6(parseIPv6('1:0:0:1:0:0:0:1'))).toBe('1:0:0:1::1');
    expect(formatIPv6(parseIPv6('1:0:0:0:1:0:0:0'))).toBe('1::1:0:0:0');
    expect(formatIPv6(parseIPv6('2001:db8:0:0:1:0:0:1'))).toBe('2001:db8::1:0:0:1');
    expect(formatIPv6(parseIPv6('fe80::0001'))).toBe('fe80::1');
  });

  it('поддерживает встроенный IPv4 и зону', () => {
    expect(formatIPv6(parseIPv6('::ffff:192.168.0.1'))).toBe('::ffff:c0a8:1');
    expect(formatIPv6(parseIPv6('2001:db8::1%eth0'))).toBe('2001:db8::1');
    expect(parseIPv6('64:ff9b::192.0.2.33')).toBe(parseIPv6('64:ff9b::c000:221'));
  });

  it('отбраковывает некорректные записи', () => {
    expect(() => parseIPv6('2001:db8::1::2')).toThrow(/одно «::»/);
    expect(() => parseIPv6('1:2:3:4:5:6:7:8:9')).toThrow(IpError);
    expect(() => parseIPv6('1:2:3:4:5:6:7')).toThrow(/8 групп/);
    expect(() => parseIPv6('1::2:3:4:5:6:7:8')).toThrow(/хотя бы одну группу/);
    expect(() => parseIPv6('12345::1')).toThrow(IpError);
    expect(() => parseIPv6('gggg::1')).toThrow(IpError);
  });
});

describe('CIDR и маски', () => {
  it('разбирает разные формы записи', () => {
    expect(parseCidr('10.0.0.0/24')).toMatchObject({ family: 4, prefix: 24 });
    expect(parseCidr('10.0.0.1 255.255.255.0')).toMatchObject({ family: 4, prefix: 24 });
    expect(parseCidr('10.0.0.1', 4).prefix).toBe(32);
    expect(parseCidr('10.0.0.1/0').prefix).toBe(0);
    expect(parseCidr('2001:db8::/64').prefix).toBe(64);
    expect(parseCidr('2001:db8:: ffff:ffff:ffff:ffff::').prefix).toBe(64);
    expect(parseCidr('::/0').prefix).toBe(0);
  });

  it('вычисляет префикс из непрерывной маски', () => {
    expect(prefixFromMask(parseIPv4('255.255.255.0'), 4)).toBe(24);
    expect(prefixFromMask(parseIPv4('255.255.255.255'), 4)).toBe(32);
    expect(prefixFromMask(parseIPv4('0.0.0.0'), 4)).toBe(0);
    expect(prefixFromMask(parseIPv4('255.255.254.0'), 4)).toBe(23);
    expect(() => prefixFromMask(parseIPv4('255.0.255.0'), 4)).toThrow(/непрерывна/);
    expect(() => prefixFromMask(parseIPv4('255.0.255.0'), 4)).toThrow(IpError);
  });

  it('маска и wildcard', () => {
    expect(formatIPv4(maskV4FromPrefix(24))).toBe('255.255.255.0');
    expect(formatIPv4(maskV4FromPrefix(0))).toBe('0.0.0.0');
    expect(formatIPv4(maskV4FromPrefix(32))).toBe('255.255.255.255');
    expect(formatIPv4(wildcardFromPrefix(4, 24))).toBe('0.0.0.255');
    expect(formatIPv4(wildcardFromPrefix(4, 0))).toBe('255.255.255.255');
  });

  it('отбраковывает плохие префиксы', () => {
    expect(() => parseCidr('10.0.0.1/33')).toThrow(IpError);
    expect(() => parseCidr('10.0.0.1/-1')).toThrow(IpError);
    expect(() => parseCidr('2001:db8::/129')).toThrow(IpError);
    expect(() => parseCidr('10.0.0.1 255.255.255.0/24')).toThrow(IpError);
    expect(() => parseCidr('10.0.0.1 255.0.0.255')).toThrow(IpError);
  });
});

describe('границы и ёмкость', () => {
  it('сеть и широковещательный адрес IPv4', () => {
    const addr = parseIPv4('192.168.1.10');
    expect(formatIPv4(networkOf(addr, 24, 4))).toBe('192.168.1.0');
    expect(formatIPv4(lastOf(networkOf(addr, 24, 4), 24, 4))).toBe('192.168.1.255');
    expect(formatIPv4(networkOf(addr, 0, 4))).toBe('0.0.0.0');
    expect(formatIPv4(lastOf(0n, 0, 4))).toBe('255.255.255.255');
    expect(formatIPv4(networkOf(addr, 32, 4))).toBe('192.168.1.10');
  });

  it('границы IPv6', () => {
    const addr = parseIPv6('2001:db8:abcd::1');
    expect(formatIPv6(networkOf(addr, 48, 6))).toBe('2001:db8:abcd::');
    expect(formatIPv6(lastOf(networkOf(addr, 48, 6), 48, 6))).toBe('2001:db8:abcd:ffff:ffff:ffff:ffff:ffff');
    expect(formatIPv6(lastOf(0n, 0, 6))).toBe('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff');
  });

  it('корректно считает /0, /31, /32 (RFC 3021)', () => {
    expect(totalCount(0, 4)).toBe(4294967296n);
    expect(usableCount(0, 4)).toBe(4294967294n);
    expect(totalCount(31, 4)).toBe(2n);
    expect(usableCount(31, 4)).toBe(2n);
    expect(totalCount(32, 4)).toBe(1n);
    expect(usableCount(32, 4)).toBe(1n);
    expect(usableCount(30, 4)).toBe(2n);
    expect(usableCount(24, 4)).toBe(254n);
    expect(usableCount(1, 4)).toBe(2147483646n);
  });

  it('IPv6 без broadcast', () => {
    expect(totalCount(0, 6)).toBe(1n << 128n);
    expect(usableCount(0, 6)).toBe(1n << 128n);
    expect(totalCount(64, 6)).toBe(18446744073709551616n);
    expect(usableCount(64, 6)).toBe(18446744073709551616n);
    expect(usableCount(127, 6)).toBe(2n);
    expect(usableCount(128, 6)).toBe(1n);
  });
});

describe('классы IPv4', () => {
  it('определяет классы на границах', () => {
    const cls = (ip: string) => classOfV4(parseIPv4(ip));
    expect(cls('0.0.0.0')).toBe('A');
    expect(cls('1.0.0.0')).toBe('A');
    expect(cls('126.255.255.255')).toBe('A');
    expect(cls('127.0.0.1')).toBe('A');
    expect(cls('128.0.0.0')).toBe('B');
    expect(cls('191.255.255.255')).toBe('B');
    expect(cls('192.0.0.0')).toBe('C');
    expect(cls('223.255.255.255')).toBe('C');
    expect(cls('224.0.0.0')).toBe('D');
    expect(cls('239.255.255.255')).toBe('D');
    expect(cls('240.0.0.0')).toBe('E');
    expect(cls('255.255.255.255')).toBe('E');
  });

  it('даёт классовую маску', () => {
    expect(classfulPrefix(parseIPv4('10.1.2.3'))).toBe(8);
    expect(classfulPrefix(parseIPv4('172.16.0.1'))).toBe(16);
    expect(classfulPrefix(parseIPv4('192.168.0.1'))).toBe(24);
    expect(classfulPrefix(parseIPv4('224.0.0.1'))).toBeNull();
  });
});

describe('классификация адресов', () => {
  const check = (ip: string, expected: { kind: string; global: boolean; local?: boolean }) => {
    const { family, address } = parseAddress(ip);
    const info = classifyAddress(address, family);
    expect({ kind: info.kind, global: info.global }).toMatchObject({
      kind: expected.kind,
      global: expected.global,
    });
    if (expected.local !== undefined) expect(info.local).toBe(expected.local);
  };

  it('IPv4: приватные, публичные и специальные', () => {
    check('8.8.8.8', { kind: 'global', global: true, local: false });
    check('1.1.1.1', { kind: 'global', global: true });
    check('10.1.2.3', { kind: 'private', global: false, local: true });
    check('172.16.0.1', { kind: 'private', global: false });
    check('172.31.255.255', { kind: 'private', global: false });
    check('172.32.0.1', { kind: 'global', global: true });
    check('192.168.0.1', { kind: 'private', global: false });
    check('127.0.0.1', { kind: 'loopback', global: false, local: true });
    check('169.254.10.10', { kind: 'link-local', global: false, local: true });
    check('100.64.0.1', { kind: 'cgnat', global: false, local: true });
    check('100.127.255.255', { kind: 'cgnat', global: false });
    check('100.128.0.0', { kind: 'global', global: true });
    check('224.0.0.1', { kind: 'multicast', global: false });
    check('239.255.255.255', { kind: 'multicast', global: false });
    check('240.0.0.1', { kind: 'reserved', global: false });
    check('255.255.255.255', { kind: 'broadcast', global: false });
    check('192.0.2.10', { kind: 'documentation', global: false });
    check('198.51.100.7', { kind: 'documentation', global: false });
    check('203.0.113.7', { kind: 'documentation', global: false });
    check('198.18.0.1', { kind: 'benchmark', global: false });
    check('0.0.0.0', { kind: 'reserved', global: false });
  });

  it('IPv6: специальные диапазоны', () => {
    check('2606:4700:4700::1111', { kind: 'global', global: true });
    check('2001:4860:4860::8888', { kind: 'global', global: true });
    check('2001:db8::1', { kind: 'documentation', global: false });
    check('fe80::1', { kind: 'link-local', global: false, local: true });
    check('fd12:3456:789a::1', { kind: 'ula', global: false, local: true });
    check('ff02::1', { kind: 'multicast', global: false });
    check('::1', { kind: 'loopback', global: false, local: true });
    check('::', { kind: 'unspecified', global: false });
    check('::ffff:192.168.0.1', { kind: 'mapped', global: false });
    check('64:ff9b::808:808', { kind: 'nat64', global: false });
    check('2002::1', { kind: 'transition', global: false });
    check('3fff::1', { kind: 'documentation', global: false });
    check('4000::1', { kind: 'reserved', global: false });
  });

  it('реестр IANA содержит оба семейства и валиден', () => {
    const ranges = specialRanges();
    expect(ranges.length).toBeGreaterThan(30);
    expect(ranges.some((r) => r.family === 4)).toBe(true);
    expect(ranges.some((r) => r.family === 6)).toBe(true);
    for (const range of ranges) {
      expect(range.prefix).toBeGreaterThanOrEqual(0);
      expect(range.prefix).toBeLessThanOrEqual(range.family === 4 ? 32 : 128);
      // базовый адрес обязан быть сетевым для своего префикса
      expect(networkOf(range.base, range.prefix, range.family)).toBe(range.base);
      expect(range.rfc.length).toBeGreaterThan(0);
    }
  });
});

describe('утилиты', () => {
  it('обратный DNS', () => {
    expect(reverseDns(parseIPv4('192.168.1.10'), 4)).toBe('10.1.168.192.in-addr.arpa');
    const v6 = reverseDns(parseIPv6('2001:db8::1'), 6);
    expect(v6.endsWith('.ip6.arpa')).toBe(true);
    expect(v6.split('.').length).toBe(34);
    expect(v6.startsWith('1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2')).toBe(
      true,
    );
  });

  it('EUI-64 из MAC', () => {
    expect(eui64LinkLocal('00:1a:2b:3c:4d:5e')).toBe('fe80::21a:2bff:fe3c:4d5e');
    expect(eui64LinkLocal('00-1A-2B-3C-4D-5E')).toBe('fe80::21a:2bff:fe3c:4d5e');
    expect(() => eui64LinkLocal('001a2b')).toThrow(IpError);
  });

  it('битовые строки обратимы', () => {
    const v4 = parseIPv4('192.168.1.10');
    const bits = toBitString(v4, 4);
    expect(bits).toHaveLength(32);
    expect(fromBitString(bits, 4)).toBe(v4);
    const v6 = parseIPv6('2001:db8::dead:beef');
    const bits6 = toBitString(v6, 6);
    expect(bits6).toHaveLength(128);
    expect(fromBitString(bits6, 6)).toBe(v6);
  });

  it('форматирование чисел', () => {
    expect(groupDigits(4294967294n)).toBe('4\u00a0294\u00a0967\u00a0294');
    expect(humanCount(4294967296n)).toBe('4\u00a0294\u00a0967\u00a0296 (2^32)');
    expect(humanCount(254n)).toBe('254');
  });
});
