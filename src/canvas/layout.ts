/**
 * Авто-раскладка холста: устройства раскладываются по уровням связей.
 * Уровень 0 — самое верхнее устройство (обычно интернет/шлюз), дальше BFS.
 * Внутри уровня порядок подбирается по среднему X соседей сверху, чтобы
 * провода пересекались меньше. Изолированные устройства собираются в нижний ряд.
 */

import type { Device, ProjectDocument } from '../core/project';
import { NODE_HEIGHT, NODE_WIDTH, type Point } from './geometry';

export interface AutoLayoutOptions {
  /** Горизонтальный зазор между узлами. */
  columnGap?: number;
  /** Вертикальный зазор между уровнями. */
  rowGap?: number;
  /** Сетка, к которой прилипают координаты. */
  grid?: number;
}

interface Placed {
  device: Device;
  level: number;
  order: number;
}

export function autoLayout(
  doc: ProjectDocument,
  options: AutoLayoutOptions = {},
): Map<string, Point> {
  const result = new Map<string, Point>();
  const devices = doc.devices;
  if (devices.length === 0) return result;

  const columnGap = options.columnGap ?? 48;
  const rowGap = options.rowGap ?? 72;
  const grid = options.grid && options.grid > 0 ? options.grid : 1;

  const byId = new Map(devices.map((device) => [device.id, device]));
  const neighbors = new Map<string, string[]>();
  for (const device of devices) neighbors.set(device.id, []);
  for (const link of doc.links) {
    if (!byId.has(link.a.deviceId) || !byId.has(link.b.deviceId)) continue;
    neighbors.get(link.a.deviceId)?.push(link.b.deviceId);
    neighbors.get(link.b.deviceId)?.push(link.a.deviceId);
  }

  const positionOf = (device: Device) => device.canvas ?? { x: 0, y: 0 };
  const sortByPosition = (a: Device, b: Device) => {
    const pa = positionOf(a);
    const pb = positionOf(b);
    return pa.y - pb.y || pa.x - pb.x || a.name.localeCompare(b.name, 'ru');
  };

  const visited = new Set<string>();
  const placed: Placed[] = [];
  let nextLevel = 0;

  const bfs = (root: Device) => {
    const levels = new Map<string, number>();
    const queue: Device[] = [root];
    levels.set(root.id, 0);
    visited.add(root.id);
    while (queue.length > 0) {
      const current = queue.shift() as Device;
      const level = levels.get(current.id) ?? 0;
      for (const id of neighbors.get(current.id) ?? []) {
        if (visited.has(id) || !byId.has(id)) continue;
        visited.add(id);
        levels.set(id, level + 1);
        queue.push(byId.get(id) as Device);
      }
    }
    const maxLevel = Math.max(0, ...levels.values());
    for (let level = 0; level <= maxLevel; level++) {
      const row = devices
        .filter((device) => levels.get(device.id) === level)
        .sort((a, b) => {
          if (level === 0) return sortByPosition(a, b);
          const barycenter = (device: Device) => {
            const points = (neighbors.get(device.id) ?? [])
              .map((id) => levels.get(id) === level - 1 ? byId.get(id) : null)
              .filter((item): item is Device => item != null)
              .map((item) => positionOf(item).x);
            if (points.length === 0) return positionOf(device).x;
            return points.reduce((sum, value) => sum + value, 0) / points.length;
          };
          return barycenter(a) - barycenter(b) || sortByPosition(a, b);
        });
      row.forEach((device, order) => {
        placed.push({ device, level: nextLevel + level, order });
      });
    }
    nextLevel += maxLevel + 1;
  };

  // Связные компоненты раскладываем друг под другом.
  while (visited.size < devices.length) {
    const rest = devices.filter((device) => !visited.has(device.id));
    rest.sort(sortByPosition);
    const connected = rest.find((device) => (neighbors.get(device.id) ?? []).length > 0);
    if (!connected) break;
    bfs(connected);
  }

  // Устройства без связей — в один нижний ряд.
  const isolated = devices.filter((device) => !visited.has(device.id)).sort(sortByPosition);
  isolated.forEach((device, order) => {
    placed.push({ device, level: nextLevel, order });
  });

  const rows = new Map<number, Placed[]>();
  for (const item of placed) {
    const row = rows.get(item.level) ?? [];
    row.push(item);
    rows.set(item.level, row);
  }

  for (const [level, row] of rows) {
    row.sort((a, b) => a.order - b.order);
    const width = row.length * NODE_WIDTH + Math.max(0, row.length - 1) * columnGap;
    const startX = -width / 2;
    const y = level * (NODE_HEIGHT + rowGap);
    row.forEach((item, index) => {
      const x = startX + index * (NODE_WIDTH + columnGap);
      result.set(item.device.id, {
        x: Math.round(x / grid) * grid,
        y: Math.round(y / grid) * grid,
      });
    });
  }

  return result;
}
