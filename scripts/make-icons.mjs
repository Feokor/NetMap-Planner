/**
 * Рисует иконку приложения без внешних зависимостей и раскладывает её по всем
 * местам: build/ (Electron/Windows/Linux), public/ (favicon) и Android mipmap.
 *
 * Иконка: тёмный скруглённый квадрат и голубая сеть из четырёх узлов.
 * Запуск: node scripts/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ACCENT = [77, 156, 255];
const NODE_LIGHT = [219, 234, 254];
const BG_TOP = [22, 35, 58];
const BG_BOTTOM = [11, 18, 32];

/* --- минимальный PNG-энкодер --------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --- геометрия и заливка ------------------------------------------- */

function insideRoundedSquare(x, y, radius) {
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  const dx = Math.max(radius - x, 0, x - (1 - radius));
  const dy = Math.max(radius - y, 0, y - (1 - radius));
  return dx * dx + dy * dy <= radius * radius;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function blend(target, index, color, alpha) {
  if (alpha <= 0) return;
  const a = target[index + 3] / 255;
  const outA = alpha + a * (1 - alpha);
  if (outA <= 0) return;
  for (let i = 0; i < 3; i++) {
    target[index + i] = Math.round((color[i] * alpha + target[index + i] * a * (1 - alpha)) / outA);
  }
  target[index + 3] = Math.round(outA * 255);
}

const HUB = { x: 0.5, y: 0.55, r: 0.105 };
const SATS = [
  { x: 0.5, y: 0.21, r: 0.068 },
  { x: 0.2, y: 0.74, r: 0.068 },
  { x: 0.8, y: 0.74, r: 0.068 },
];

/** Возвращает пиксели иконки size×size. background=false — прозрачный фон. */
function renderIcon(size, { background = true, round = false, glyphScale = 1 } = {}) {
  const scale = 6;
  const big = size * scale;
  const buffer = new Uint8ClampedArray(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const x = (px * scale + sx + 0.5) / big;
          const y = (py * scale + sy + 0.5) / big;
          const sub = [0, 0, 0, 0];
          const visible =
            (background ? insideRoundedSquare(x, y, 0.22) : true) &&
            (!round || Math.hypot(x - 0.5, y - 0.5) <= 0.5);
          if (visible) {
            if (background) {
              const color = [
                Math.round(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * y),
                Math.round(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * y),
                Math.round(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * y),
              ];
              blend(sub, 0, color, 1);
            }
            const gx = (x - 0.5) / glyphScale + 0.5;
            const gy = (y - 0.5) / glyphScale + 0.5;
            for (const sat of SATS) {
              const distance = distanceToSegment(gx, gy, HUB.x, HUB.y, sat.x, sat.y);
              if (distance < 0.032) blend(sub, 0, ACCENT, 0.9);
            }
            for (const node of [HUB, ...SATS]) {
              if (Math.hypot(gx - node.x, gy - node.y) <= node.r) {
                blend(sub, 0, node === HUB ? ACCENT : NODE_LIGHT, 1);
              }
            }
          }
          r += sub[0] * (sub[3] / 255);
          g += sub[1] * (sub[3] / 255);
          b += sub[2] * (sub[3] / 255);
          a += sub[3];
        }
      }
      const index = (py * size + px) * 4;
      const alpha = a / (scale * scale);
      buffer[index + 3] = Math.round(alpha);
      if (alpha > 0) {
        const weight = alpha / 255;
        buffer[index] = Math.round(r / (scale * scale) / weight);
        buffer[index + 1] = Math.round(g / (scale * scale) / weight);
        buffer[index + 2] = Math.round(b / (scale * scale) / weight);
      }
    }
  }
  return encodePng(size, size, Buffer.from(buffer));
}

/* --- ICO ------------------------------------------------------------ */

function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const directory = [];
  for (const { size, png } of entries) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    directory.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...directory, ...entries.map((entry) => entry.png)]);
}

/* --- раскладка файлов ---------------------------------------------- */

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log(`icon: ${path.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`);
}

write(join(ROOT, 'build', 'icon.png'), renderIcon(512));
write(join(ROOT, 'public', 'icon.png'), renderIcon(256));
write(join(ROOT, 'public', 'icon-512.png'), renderIcon(512));

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const ico = buildIco(icoSizes.map((size) => ({ size, png: renderIcon(size) })));
write(join(ROOT, 'build', 'icon.ico'), ico);

// Tauri: свои имена и каталог.
write(join(ROOT, 'src-tauri', 'icons', '32x32.png'), renderIcon(32));
write(join(ROOT, 'src-tauri', 'icons', '128x128.png'), renderIcon(128));
write(join(ROOT, 'src-tauri', 'icons', '128x128@2x.png'), renderIcon(256));
write(join(ROOT, 'src-tauri', 'icons', 'icon.png'), renderIcon(512));
write(join(ROOT, 'src-tauri', 'icons', 'icon.ico'), ico);

const densities = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];
for (const [density, size] of densities) {
  const dir = join(ROOT, 'android', 'app', 'src', 'main', 'res', `mipmap-${density}`);
  write(join(dir, 'ic_launcher.png'), renderIcon(size));
  write(join(dir, 'ic_launcher_round.png'), renderIcon(size, { round: true }));
  write(join(dir, 'ic_launcher_foreground.png'), renderIcon(Math.round(size * 2.25), { background: false, glyphScale: 0.62 }));
}

console.log('готово');
