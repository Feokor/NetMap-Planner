/**
 * Геометрия холста: прямоугольники, якоря связей, зум и порядок слоёв.
 *
 * Модуль не зависит от DOM и Canvas API — всё покрывается тестами.
 */

import type { Annotation, Device, Layer } from '../core/project';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  /** Смещение мира в экранных пикселях. */
  x: number;
  y: number;
  zoom: number;
}

export type CanvasTool = 'select' | 'link' | 'rect' | 'ellipse' | 'text' | 'note' | 'arrow' | 'line';

export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 78;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;

export function nodeRect(device: Device): Rect {
  const canvas = device.canvas;
  return {
    x: canvas?.x ?? 0,
    y: canvas?.y ?? 0,
    width: canvas?.width ?? NODE_WIDTH,
    height: canvas?.height ?? NODE_HEIGHT,
  };
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Точка на границе прямоугольника в направлении цели. */
export function anchorPoint(rect: Rect, target: Point): Point {
  const center = rectCenter(rect);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (dx === 0 && dy === 0) return center;

  const halfW = Math.abs(rect.width) / 2;
  const halfH = Math.abs(rect.height) / 2;
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : halfH / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

/** Какая сторона прямоугольника ближе к точке. */
function sideOf(rect: Rect, point: Point): 'l' | 'r' | 't' | 'b' {
  const dl = Math.abs(point.x - rect.x);
  const dr = Math.abs(point.x - (rect.x + rect.width));
  const dt = Math.abs(point.y - rect.y);
  const db = Math.abs(point.y - (rect.y + rect.height));
  const min = Math.min(dl, dr, dt, db);
  if (min === dl) return 'l';
  if (min === dr) return 'r';
  return min === dt ? 't' : 'b';
}

function pushPoint(points: Point[], point: Point): void {
  const last = points[points.length - 1];
  if (!last || Math.abs(last.x - point.x) > 0.5 || Math.abs(last.y - point.y) > 0.5) {
    points.push(point);
  }
}

/**
 * Ортогональная трасса между двумя прямоугольниками: вертикаль → горизонталь →
 * вертикаль (или наоборот). `lane` сдвигает середину, чтобы провода пучка не сливались.
 * Ручные изломы (`bends`) по-прежнему имеют приоритет.
 */
export function linkGeometry(
  a: Rect,
  b: Rect,
  bends: Point[] = [],
  aAnchor?: Point,
  bAnchor?: Point,
  lane = 0,
): Point[] {
  if (bends.length > 0) {
    const start = aAnchor ?? anchorPoint(a, bends[0]);
    const end = bAnchor ?? anchorPoint(b, bends[bends.length - 1]);
    return [start, ...bends, end];
  }

  const centerA = rectCenter(a);
  const centerB = rectCenter(b);
  const start = aAnchor ?? anchorPoint(a, centerB);
  const end = bAnchor ?? anchorPoint(b, centerA);
  if (Math.hypot(end.x - start.x, end.y - start.y) < 1) return [start, end];

  const sideA = sideOf(a, start);
  const sideB = sideOf(b, end);
  const horizontalA = sideA === 'l' || sideA === 'r';
  const horizontalB = sideB === 'l' || sideB === 'r';
  const shift = lane * 14;

  const points: Point[] = [start];

  if (horizontalA && horizontalB) {
    let midX: number;
    if ((sideA === 'r' && sideB === 'l') || (sideA === 'l' && sideB === 'r')) {
      midX = (start.x + end.x) / 2;
    } else {
      midX = sideA === 'r' ? Math.max(start.x, end.x) + 42 : Math.min(start.x, end.x) - 42;
    }
    midX += shift;
    pushPoint(points, { x: midX, y: start.y });
    pushPoint(points, { x: midX, y: end.y });
  } else if (!horizontalA && !horizontalB) {
    let midY: number;
    if ((sideA === 'b' && sideB === 't') || (sideA === 't' && sideB === 'b')) {
      midY = (start.y + end.y) / 2;
    } else {
      midY = sideA === 'b' ? Math.max(start.y, end.y) + 42 : Math.min(start.y, end.y) - 42;
    }
    midY += shift;
    pushPoint(points, { x: start.x, y: midY });
    pushPoint(points, { x: end.x, y: midY });
  } else if (horizontalA) {
    pushPoint(points, { x: end.x + shift, y: start.y });
    pushPoint(points, { x: end.x + shift, y: end.y });
  } else {
    pushPoint(points, { x: start.x, y: end.y + shift });
    pushPoint(points, { x: end.x, y: end.y + shift });
  }

  pushPoint(points, end);
  return points;
}

/**
 * Точка крепления конкретного порта на границе узла.
 * Порт смещается вдоль стороны, обращённой к цели, чтобы несколько связей не сходились в одну точку.
 */
export function portAnchorPoint(
  rect: Rect,
  target: Point,
  index: number,
  count: number,
  spacing = 14,
): Point {
  const base = anchorPoint(rect, target);
  if (count <= 1) return base;
  const shift = (index - (count - 1) / 2) * spacing;
  const onHorizontalEdge =
    Math.abs(base.y - rect.y) < 0.5 || Math.abs(base.y - (rect.y + rect.height)) < 0.5;
  if (onHorizontalEdge) {
    return {
      x: Math.min(rect.x + rect.width - 8, Math.max(rect.x + 8, base.x + shift)),
      y: base.y,
    };
  }
  return {
    x: base.x,
    y: Math.min(rect.y + rect.height - 8, Math.max(rect.y + 8, base.y + shift)),
  };
}

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

/** Точка на полилинии по доле длины: 0 — начало, 1 — конец. */
export function pointAtFraction(points: Point[], fraction: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  const target = polylineLength(points) * Math.min(Math.max(fraction, 0), 1);
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    const segment = Math.hypot(to.x - from.x, to.y - from.y);
    if (walked + segment >= target) {
      const local = segment === 0 ? 0 : (target - walked) / segment;
      return { x: from.x + (to.x - from.x) * local, y: from.y + (to.y - from.y) * local };
    }
    walked += segment;
  }
  return points[points.length - 1];
}

export function snap(value: number, grid: number): number {
  if (!Number.isFinite(grid) || grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToWorld(point: Point, view: Viewport): Point {
  return { x: (point.x - view.x) / view.zoom, y: (point.y - view.y) / view.zoom };
}

export function worldToScreen(point: Point, view: Viewport): Point {
  return { x: point.x * view.zoom + view.x, y: point.y * view.zoom + view.y };
}

/** Зум с сохранением точки под курсором. */
export function zoomAt(view: Viewport, screenPoint: Point, nextZoom: number): Viewport {
  const zoom = clampZoom(nextZoom);
  const world = screenToWorld(screenPoint, view);
  return { zoom, x: screenPoint.x - world.x * zoom, y: screenPoint.y - world.y * zoom };
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Самое верхнее устройство под точкой (порядок массива = порядок отрисовки). */
export function hitTestDevices(devices: Device[], point: Point): Device | null {
  for (let i = devices.length - 1; i >= 0; i--) {
    if (pointInRect(point, nodeRect(devices[i]))) return devices[i];
  }
  return null;
}

/** Расстояние от точки до отрезка. */
export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Расстояние от точки до ломаной. */
export function distanceToPolyline(points: Point[], point: Point): number {
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i++) {
    best = Math.min(best, distanceToSegment(point, points[i - 1], points[i]));
  }
  return best;
}

/** Сдвигает ломаную перпендикулярно общему направлению — чтобы связи не сливались. */
export function offsetPolyline(points: Point[], offset: number): Point[] {
  if (offset === 0 || points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return points;
  const nx = (-dy / length) * offset;
  const ny = (dx / length) * offset;
  return points.map((point) => ({ x: point.x + nx, y: point.y + ny }));
}

/**
 * Ищет свободное место для узла рядом с желаемой точкой.
 * Сканирует расширяющиеся кольца с шагом сетки и проверяет пересечение с занятыми прямоугольниками.
 */
export function findFreeSpot(
  occupied: Rect[],
  size: { width: number; height: number },
  preferred: Point,
  options: { step?: number; gap?: number; rings?: number } = {},
): Point {
  const step = options.step ?? 24;
  const gap = options.gap ?? 14;
  const rings = options.rings ?? 40;
  const fits = (x: number, y: number) => {
    const candidate: Rect = { x: x - gap, y: y - gap, width: size.width + gap * 2, height: size.height + gap * 2 };
    return !occupied.some((rect) => rectsIntersect(candidate, rect));
  };
  if (fits(preferred.x, preferred.y)) return preferred;
  for (let ring = 1; ring <= rings; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (const dy of [-ring, ring]) {
        const x = preferred.x + dx * step;
        const y = preferred.y + dy * step;
        if (fits(x, y)) return { x, y };
      }
    }
    for (let dy = -ring + 1; dy <= ring - 1; dy++) {
      for (const dx of [-ring, ring]) {
        const x = preferred.x + dx * step;
        const y = preferred.y + dy * step;
        if (fits(x, y)) return { x, y };
      }
    }
  }
  return preferred;
}

export function annotationRect(annotation: Annotation): Rect {
  if (annotation.kind === 'line' || annotation.kind === 'arrow') {
    return {
      x: Math.min(annotation.x, annotation.x + annotation.width),
      y: Math.min(annotation.y, annotation.y + annotation.height),
      width: Math.abs(annotation.width),
      height: Math.abs(annotation.height),
    };
  }
  return {
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
  };
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Вписывает содержимое в экран с отступами. */
export function fitViewport(
  rects: Rect[],
  width: number,
  height: number,
  padding = 64,
): Viewport {
  const bounds = unionRects(rects);
  if (!bounds || width <= 0 || height <= 0) return { x: 0, y: 0, zoom: 1 };

  const availableW = Math.max(width - padding * 2, 40);
  const availableH = Math.max(height - padding * 2, 40);
  const zoom = clampZoom(
    Math.min(availableW / Math.max(bounds.width, 1), availableH / Math.max(bounds.height, 1), 1.4),
  );

  return {
    zoom,
    x: (width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: (height - bounds.height * zoom) / 2 - bounds.y * zoom,
  };
}

/**
 * Шаг сетки в мировых единицах: держим экранный интервал в комфортном диапазоне.
 */
export function gridStep(zoom: number, base: number): number {
  const safeBase = base > 0 ? base : 16;
  let step = safeBase;
  let guard = 0;
  while (step * zoom < 9 && guard++ < 24) step *= 2;
  while (step * zoom > 44 && guard++ < 48) step /= 2;
  return step;
}

export interface LayerPlan {
  /** Слои в порядке отрисовки: снизу вверх. */
  layers: Layer[];
  /** Индекс структурного слоя или -1, если он скрыт. */
  structureAt: number;
}

/**
 * Порядок отрисовки. Структурный слой с `pinnedTop` поднимается над рисунками,
 * чтобы заметки не перекрывали устройства; это можно отключить в панели слоёв.
 */
export function layerPlan(layers: Layer[]): LayerPlan {
  const visible = layers.filter((layer) => layer.visible !== false);
  const ordered = [...visible].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const structure = ordered.findIndex((layer) => layer.kind === 'structure');
  if (structure === -1) return { layers: ordered, structureAt: -1 };

  if (ordered[structure].pinnedTop !== false && structure !== ordered.length - 1) {
    const [item] = ordered.splice(structure, 1);
    ordered.push(item);
  }

  return { layers: ordered, structureAt: ordered.findIndex((layer) => layer.kind === 'structure') };
}

export function layerById(layers: Layer[], id: string | undefined): Layer | null {
  if (!id) return null;
  return layers.find((layer) => layer.id === id) ?? null;
}

export function isLayerLocked(layers: Layer[], id: string | undefined): boolean {
  return layerById(layers, id)?.locked === true;
}
