import type { Device, Link, ProjectDocument } from '../core/project';
import {
  type Point,
  type Rect,
  anchorPoint,
  linkGeometry,
  nodeRect,
  portAnchorPoint,
  rectCenter,
} from './geometry';

/** Шаг между параллельными проводами одного пучка. */
export const LANE_STEP = 14;

/** Прямоугольник устройства с учётом промежуточного перетаскивания. */
export function previewRect(device: Device, preview?: Map<string, Point>): Rect {
  const rect = nodeRect(device);
  const moved = preview?.get(device.id);
  return moved ? { ...rect, x: moved.x, y: moved.y } : rect;
}

/** Точка крепления порта (или обычный якорь, если порт не задан). */
function portAnchorFor(
  device: Device,
  rect: Rect,
  portId: string | null | undefined,
  target: Point,
): Point {
  if (!portId || device.ports.length === 0) return anchorPoint(rect, target);
  const index = device.ports.findIndex((port) => port.id === portId);
  if (index < 0) return anchorPoint(rect, target);
  return portAnchorPoint(rect, target, index, device.ports.length);
}

/** Номер дорожки внутри пучка: 0 — одиночная линия, ±n — параллельные. */
export function laneOf(doc: ProjectDocument, link: Link): number {
  const key = [link.a.deviceId, link.b.deviceId].sort().join('|');
  const siblings = doc.links.filter(
    (item) => [item.a.deviceId, item.b.deviceId].sort().join('|') === key,
  );
  if (siblings.length < 2) return 0;
  const index = siblings.findIndex((item) => item.id === link.id);
  return index - (siblings.length - 1) / 2;
}

/**
 * Готовая ломаная связи — одна и та же для отрисовки и попадания курсором.
 * Ортогональная трасса, пучок разводится по дорожкам.
 */
export function linkPoints(
  doc: ProjectDocument,
  link: Link,
  options: { preview?: Map<string, Point> } = {},
): Point[] {
  const a = doc.devices.find((item) => item.id === link.a.deviceId);
  const b = doc.devices.find((item) => item.id === link.b.deviceId);
  if (!a || !b) return [];
  const rectA = previewRect(a, options.preview);
  const rectB = previewRect(b, options.preview);
  const aAnchor = portAnchorFor(a, rectA, link.a.portId, rectCenter(rectB));
  const bAnchor = portAnchorFor(b, rectB, link.b.portId, rectCenter(rectA));
  return linkGeometry(
    rectA,
    rectB,
    link.points ?? [],
    aAnchor,
    bAnchor,
    laneOf(doc, link),
  );
}
