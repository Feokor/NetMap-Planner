import { groupDigits } from '../core/ip';

/** Компактная запись огромных чисел: 6.8×10^36 вместо 37 цифр. */
export function compactBig(value: bigint): string {
  const digits = value.toString();
  if (digits.length <= 12) return groupDigits(value);
  const exponent = digits.length - 1;
  const mantissa = Number(digits.slice(0, 2)) / 10;
  return `${mantissa.toFixed(1)}×10^${groupDigits(exponent)}`;
}

/** Короткая подпись для счётчика строк: 340…1453. */
export function shortBig(value: bigint): string {
  const digits = value.toString();
  if (digits.length <= 9) return groupDigits(value);
  return `${digits.slice(0, 3)}…${digits.slice(-4)}`;
}

/** Русское склонение по числу: 1 порт, 2 порта, 5 портов. */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
