/**
 * Отрисовка сцены на Canvas 2D.
 *
 * Вся геометрия — в мировых координатах; масштаб и смещение задаются
 * трансформацией контекста, поэтому текст и скругления остаются чёткими.
 */

import type {
  Annotation,
  Device,
  Link,
  LinkMedia,
  ProjectDocument,
} from '../core/project';
import {
  type CanvasTool,
  type Point,
  type Rect,
  type Viewport,
  anchorPoint,
  annotationHandlePoints,
  annotationRect,
  gridStep,
  layerPlan,
  nodeRect,
  pointAtFraction,
  portAnchorPoint,
  rectCenter,
  rectsIntersect,
} from './geometry';
import { linkPoints } from './links';

export type ThemeName = 'dark' | 'light';

export interface Palette {
  background: string;
  grid: string;
  gridStrong: string;
  node: string;
  nodeAlt: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  labelBg: string;
  shadow: string;
}

export const PALETTES: Record<ThemeName, Palette> = {
  dark: {
    background: '#0b1220',
    grid: 'rgba(148, 163, 184, 0.10)',
    gridStrong: 'rgba(148, 163, 184, 0.20)',
    node: '#16233a',
    nodeAlt: '#1b2a44',
    border: '#2c3d59',
    text: '#e8eef9',
    muted: '#93a4bd',
    accent: '#4d9cff',
    accentSoft: 'rgba(77, 156, 255, 0.20)',
    labelBg: 'rgba(11, 18, 32, 0.90)',
    shadow: 'rgba(0, 0, 0, 0.42)',
  },
  light: {
    background: '#f4f6fb',
    grid: 'rgba(15, 23, 42, 0.07)',
    gridStrong: 'rgba(15, 23, 42, 0.14)',
    node: '#ffffff',
    nodeAlt: '#f1f5fb',
    border: '#cdd7e6',
    text: '#101a2b',
    muted: '#5d6d85',
    accent: '#2563eb',
    accentSoft: 'rgba(37, 99, 235, 0.14)',
    labelBg: 'rgba(255, 255, 255, 0.92)',
    shadow: 'rgba(15, 23, 42, 0.18)',
  },
};

export const MEDIA_COLORS: Record<LinkMedia, string> = {
  copper: '#f0a35e',
  fiber: '#4d9cff',
  wireless: '#a78bfa',
  wan: '#f87171',
  virtual: '#34d399',
};

const LAYER_COLORS: Record<string, string> = {
  L1: '#f59e0b',
  L2: '#34d399',
  L3: '#60a5fa',
};

/** Цвета логических протоколов на холсте (OSPF/BGP). */
const PROTOCOL_COLORS: Record<string, string> = {
  ospf: '#fb923c',
  bgp: '#c084fc',
};

const KIND_COLORS: Record<string, string> = {
  router: '#60a5fa',
  switch: '#34d399',
  firewall: '#f87171',
  server: '#a78bfa',
  pc: '#94a3b8',
  laptop: '#94a3b8',
  phone: '#f472b6',
  printer: '#fbbf24',
  camera: '#22d3ee',
  ap: '#c084fc',
  nas: '#4ade80',
  ups: '#f59e0b',
  cloud: '#38bdf8',
  other: '#94a3b8',
};

const KIND_GLYPHS: Record<string, string> = {
  router: 'R',
  switch: 'S',
  firewall: 'F',
  server: 'S',
  pc: 'P',
  laptop: 'L',
  phone: 'T',
  printer: 'P',
  camera: 'C',
  ap: 'A',
  nas: 'N',
  ups: 'U',
  cloud: '☁',
  other: '•',
};

export interface DraftShape {
  kind: Extract<CanvasTool, 'rect' | 'ellipse' | 'arrow' | 'line' | 'note' | 'text'>;
  start: Point;
  end: Point;
}

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  doc: ProjectDocument;
  view: Viewport;
  width: number;
  height: number;
  dpr: number;
  theme: ThemeName;
  selection: string[];
  hoveredId: string | null;
  linkSourceId: string | null;
  preview: Map<string, Point>;
  pointer: Point | null;
  activeTool: CanvasTool;
  draft: DraftShape | null;
  /** Выбранная связь (подсветка и удаление). */
  selectedLinkId?: string | null;
  /** Выбранная аннотация (подсветка, цвет и удаление). */
  selectedAnnotationId?: string | null;
  /** Цвет новых рисунков. */
  annotationColor?: string;
  /** Направляющие выравнивания при перетаскивании. */
  guides?: Array<{ axis: 'x' | 'y'; value: number }>;
}

function roundedPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function clipText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
        if (lines.length === maxLines) break;
      }
    }
    if (lines.length === maxLines) break;
    if (current) lines.push(current);
    if (lines.length === maxLines) break;
  }
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines) {
    const lastIndex = maxLines - 1;
    lines[lastIndex] = clipText(ctx, lines[lastIndex], maxWidth);
  }
  return lines;
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  center: Point,
  pal: Palette,
  color: string,
): void {
  ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
  const padding = 5;
  const width = ctx.measureText(text).width + padding * 2;
  const height = 17;
  roundedPath(ctx, center.x - width / 2, center.y - height / 2, width, height, 6);
  ctx.fillStyle = pal.labelBg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, center.x, center.y + 0.5);
}

function drawGrid(ctx: CanvasRenderingContext2D, input: RenderInput, pal: Palette): void {
  const { view, width, height } = input;
  const step = gridStep(view.zoom, input.doc.settings.grid);
  const left = -view.x / view.zoom;
  const top = -view.y / view.zoom;
  const right = left + width / view.zoom;
  const bottom = top + height / view.zoom;

  const startX = Math.floor(left / step) * step;
  const startY = Math.floor(top / step) * step;

  ctx.save();
  ctx.lineWidth = 1 / view.zoom;
  ctx.strokeStyle = pal.grid;
  ctx.beginPath();
  let guard = 0;
  for (let x = startX; x <= right && guard < 900; x += step, guard++) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let y = startY; y <= bottom && guard < 1800; y += step, guard++) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();

  // Оси координат заметнее обычной сетки.
  ctx.strokeStyle = pal.gridStrong;
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(0, bottom);
  ctx.moveTo(left, 0);
  ctx.lineTo(right, 0);
  ctx.stroke();
  ctx.restore();
}

function linkWidth(link: Link): number {
  if (link.style?.width) return link.style.width;
  switch (link.media) {
    case 'fiber':
      return 2.8;
    case 'wan':
      return 2.6;
    case 'wireless':
      return 2;
    case 'virtual':
      return 1.6;
    default:
      return 2.2;
  }
}

function previewRect(device: Device, preview: Map<string, Point>): Rect {
  const rect = nodeRect(device);
  const moved = preview.get(device.id);
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

function drawLinks(ctx: CanvasRenderingContext2D, input: RenderInput, pal: Palette): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const link of input.doc.links) {
    const raw = linkPoints(input.doc, link, { preview: input.preview });
    if (raw.length < 2) continue;

    const points = raw;
    const selected = input.selectedLinkId === link.id;

    const color = link.color || MEDIA_COLORS[link.media] || pal.muted;

    if (selected) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.strokeStyle = pal.accentSoft;
      ctx.lineWidth = linkWidth(link) + 6;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.strokeStyle = color;
    ctx.lineWidth = linkWidth(link) + (selected ? 1 : 0);
    ctx.setLineDash(link.style?.dashed || link.media === 'wireless' || link.media === 'virtual' ? [7, 5] : []);
    ctx.globalAlpha = 0.92;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    if (link.label) {
      const at = pointAtFraction(points, 0.5);
      drawPill(ctx, link.label, at, pal, color);
    }

    if (link.protocol) {
      const protoColor = PROTOCOL_COLORS[link.protocol] ?? pal.accent;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.strokeStyle = protoColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 5]);
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      const detail = link.protocolDetail?.trim();
      const badge = `${link.protocol.toUpperCase()}${detail ? ` ${detail}` : ''}`;
      drawPill(ctx, badge, pointAtFraction(points, link.label ? 0.3 : 0.5), pal, protoColor);
    }
  }

  ctx.restore();
}

function ipSummary(device: Device): string {
  const entries = device.ports.flatMap((port) =>
    port.ips.map((ip) => ({ port: port.name, ip })),
  );
  if (entries.length === 0) return 'без адреса';
  const tokens: string[] = [];
  for (const { port, ip } of entries) {
    if (ip.role === 'dhcp') {
      tokens.push(`${port} ${ip.address}/${ip.prefix} DHCP`);
      continue;
    }
    if (ip.role === 'slaac') continue;
    const bits = ip.family === 4 ? 32 : 128;
    const suffix = ip.prefix === bits ? '' : `/${ip.prefix}`;
    tokens.push(`${port} ${ip.address}${suffix}`);
  }
  const shown = tokens.slice(0, 2);
  if (tokens.length > shown.length) shown.push(`+${tokens.length - shown.length}`);
  return shown.join(' · ');
}

function drawDevice(
  ctx: CanvasRenderingContext2D,
  device: Device,
  input: RenderInput,
  pal: Palette,
): void {
  const rect = previewRect(device, input.preview);
  const selected = input.selection.includes(device.id);
  const hovered = input.hoveredId === device.id;
  const layerColor = LAYER_COLORS[device.attrs.layer ?? 'L3'] ?? pal.accent;
  const kindColor = KIND_COLORS[device.kind] ?? pal.muted;
  const zoom = input.view.zoom;

  ctx.save();
  if (zoom > 0.45) {
    ctx.shadowColor = pal.shadow;
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;
  }
  roundedPath(ctx, rect.x, rect.y, rect.width, rect.height, 12);
  ctx.fillStyle = pal.node;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Цветная полоса слоя слева.
  ctx.save();
  roundedPath(ctx, rect.x, rect.y, rect.width, rect.height, 12);
  ctx.clip();
  ctx.fillStyle = layerColor;
  ctx.fillRect(rect.x, rect.y, 5, rect.height);
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = kindColor;
  ctx.fillRect(rect.x, rect.y, rect.width, 27);
  ctx.restore();

  roundedPath(ctx, rect.x, rect.y, rect.width, rect.height, 12);
  ctx.lineWidth = selected ? 2.6 : hovered ? 1.8 : 1;
  ctx.strokeStyle = selected ? pal.accent : hovered ? 'rgba(77, 156, 255, 0.7)' : pal.border;
  ctx.stroke();

  if (selected) {
    roundedPath(ctx, rect.x - 3, rect.y - 3, rect.width + 6, rect.height + 6, 14);
    ctx.strokeStyle = pal.accentSoft;
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  if (input.linkSourceId === device.id) {
    roundedPath(ctx, rect.x - 4, rect.y - 4, rect.width + 8, rect.height + 8, 15);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const iconX = rect.x + 25;
  const iconY = rect.y + 27;
  ctx.beginPath();
  ctx.arc(iconX, iconY, 13, 0, Math.PI * 2);
  ctx.fillStyle = `${kindColor}26`;
  ctx.fill();
  ctx.strokeStyle = `${kindColor}99`;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = kindColor;
  ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(KIND_GLYPHS[device.kind] ?? '•', iconX, iconY + 0.5);

  if (zoom > 0.34) {
    const textLeft = rect.x + 45;
    const textWidth = rect.width - 57;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = pal.text;
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(clipText(ctx, device.name || '—', textWidth), textLeft, rect.y + 25);

    ctx.fillStyle = pal.muted;
    ctx.font = '500 11px "Segoe UI", system-ui, sans-serif';
    const subtitle = [device.attrs.os, device.attrs.role].filter(Boolean).join(' · ');
    const portsLabel = `${device.ports.length} ${device.ports.length === 1 ? 'порт' : device.ports.length < 5 ? 'порта' : 'портов'}`;
    ctx.fillText(
      clipText(ctx, subtitle ? `${subtitle} · ${portsLabel}` : `${device.attrs.layer ?? 'L3'} · ${portsLabel}`, textWidth),
      textLeft,
      rect.y + 41,
    );

    if (zoom > 0.55) {
      const ipText = ipSummary(device);
      const hasAddress = device.ports.some((port) => port.ips.length > 0);
      ctx.fillStyle = hasAddress ? 'rgba(125, 211, 252, 0.92)' : pal.muted;
      ctx.font = '500 11px "Cascadia Mono", Consolas, monospace';
      ctx.fillText(clipText(ctx, ipText, rect.width - 24), rect.x + 12, rect.y + rect.height - 11);
    }
  }

  ctx.restore();
}

function drawDevices(
  ctx: CanvasRenderingContext2D,
  input: RenderInput,
  pal: Palette,
  viewRect: Rect,
): void {
  for (const device of input.doc.devices) {
    // Не рисуем то, что за пределами экрана: на больших схемах это заметно.
    if (!rectsIntersect(previewRect(device, input.preview), viewRect)) continue;
    drawDevice(ctx, device, input, pal);
  }
}

/** Точки портов на границах узлов: видно, какая связь за какой порт цепляется. */
function drawPortDots(
  ctx: CanvasRenderingContext2D,
  input: RenderInput,
  pal: Palette,
  viewRect: Rect,
): void {
  if (input.view.zoom < 0.4) return;
  const byId = new Map(input.doc.devices.map((device) => [device.id, device]));
  const seen = new Set<string>();

  for (const link of input.doc.links) {
    const color = link.color || MEDIA_COLORS[link.media] || pal.accent;
    const sides = [
      [link.a, link.b],
      [link.b, link.a],
    ] as const;
    for (const [endpoint, other] of sides) {
      if (!endpoint.portId) continue;
      const device = byId.get(endpoint.deviceId);
      const otherDevice = byId.get(other.deviceId);
      if (!device || !otherDevice) continue;
      const key = `${device.id}:${endpoint.portId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const rect = previewRect(device, input.preview);
      if (!rectsIntersect(rect, viewRect)) continue;
      const target = rectCenter(previewRect(otherDevice, input.preview));
      const anchor = portAnchorFor(device, rect, endpoint.portId, target);
      const port = device.ports.find((item) => item.id === endpoint.portId);

      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = pal.node;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = color;
      ctx.stroke();

      if (port && input.view.zoom > 0.7) {
        const below = anchor.y >= rect.y + rect.height / 2;
        ctx.font = '600 9px "Cascadia Mono", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = pal.muted;
        ctx.fillText(port.name, anchor.x, anchor.y + (below ? 12 : -12));
      }
    }
  }
}

function annotationFill(annotation: Annotation): string | null {
  if (annotation.fill === 'none') return null;
  if (annotation.fill) return annotation.fill;
  if (annotation.kind === 'rect' || annotation.kind === 'ellipse' || annotation.kind === 'note') {
    return '#4d9cff';
  }
  return null;
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  pal: Palette,
  selected = false,
): void {
  const opacity = annotation.opacity ?? 0.2;
  const stroke = annotation.stroke === 'none' ? null : annotation.stroke || pal.accent;
  const width = annotation.strokeWidth ?? 2;
  const rect = annotationRect(annotation);

  ctx.save();
  if (annotation.dashed) ctx.setLineDash([8, 5]);

  if (annotation.kind === 'rect' || annotation.kind === 'ellipse') {
    ctx.beginPath();
    if (annotation.kind === 'rect') {
      roundedPath(
        ctx,
        annotation.x,
        annotation.y,
        annotation.width,
        annotation.height,
        annotation.radius ?? 10,
      );
    } else {
      ctx.ellipse(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        rect.width / 2,
        rect.height / 2,
        0,
        0,
        Math.PI * 2,
      );
    }
    const fill = annotationFill(annotation);
    if (fill) {
      ctx.globalAlpha = opacity;
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  } else if (annotation.kind === 'line' || annotation.kind === 'arrow') {
    const from = { x: annotation.x, y: annotation.y };
    const to = { x: annotation.x + annotation.width, y: annotation.y + annotation.height };
    if (stroke) {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.stroke();

      if (annotation.kind === 'arrow') {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const head = 11 + width * 2;
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 7), to.y - head * Math.sin(angle - Math.PI / 7));
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 7), to.y - head * Math.sin(angle + Math.PI / 7));
        ctx.stroke();
      }
    }
  } else if (annotation.kind === 'text') {
    const size = annotation.fontSize ?? 14;
    const weight = annotation.fontWeight ?? 600;
    ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = annotation.color || pal.text;
    ctx.textAlign = annotation.textAlign ?? 'left';
    ctx.textBaseline = 'top';
    const lines = wrapText(ctx, annotation.text || '', Math.max(rect.width, 40), 12);
    const align = annotation.textAlign ?? 'left';
    const x =
      align === 'center' ? rect.x + rect.width / 2 : align === 'right' ? rect.x + rect.width : rect.x;
    lines.forEach((line, index) => {
      ctx.fillText(line, x, rect.y + index * (size + 4));
    });
  } else if (annotation.kind === 'note') {
    ctx.shadowColor = pal.shadow;
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    roundedPath(
      ctx,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      annotation.radius ?? 10,
    );
    ctx.globalAlpha = Math.max(opacity, 0.12);
    ctx.fillStyle = annotationFill(annotation) || pal.nodeAlt;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent';
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    const size = annotation.fontSize ?? 13;
    const padding = 11;
    ctx.font = `500 ${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = annotation.color || pal.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const maxLines = Math.max(1, Math.floor((rect.height - padding * 2) / (size + 4)));
    const lines = wrapText(ctx, annotation.text || '', rect.width - padding * 2, maxLines);
    lines.forEach((line, index) => {
      ctx.fillText(line, rect.x + padding, rect.y + padding + index * (size + 4));
    });
  }

  if (selected) {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(rect.x - 5, rect.y - 5, rect.width + 10, rect.height + 10);
    ctx.setLineDash([]);
  }

  ctx.restore();
}

/** Ручки изменения размера поверх выделенного рисунка. */
function drawAnnotationHandles(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  zoom: number,
  pal: Palette,
): void {
  const size = 8 / Math.max(zoom, 0.2);
  ctx.save();
  ctx.lineWidth = 1.5 / Math.max(zoom, 0.2);
  for (const handle of annotationHandlePoints(annotation)) {
    ctx.beginPath();
    if (annotation.kind === 'line' || annotation.kind === 'arrow') {
      ctx.arc(handle.point.x, handle.point.y, size / 1.6, 0, Math.PI * 2);
    } else {
      ctx.rect(
        handle.point.x - size / 2,
        handle.point.y - size / 2,
        size,
        size,
      );
    }
    ctx.fillStyle = pal.accent;
    ctx.fill();
    ctx.strokeStyle = pal.background;
    ctx.stroke();
  }
  ctx.restore();
}

function drawDraft(ctx: CanvasRenderingContext2D, draft: DraftShape, pal: Palette, color?: string): void {
  const x = Math.min(draft.start.x, draft.end.x);
  const y = Math.min(draft.start.y, draft.end.y);
  const width = Math.abs(draft.end.x - draft.start.x);
  const height = Math.abs(draft.end.y - draft.start.y);

  ctx.save();
  ctx.setLineDash([7, 5]);
  ctx.strokeStyle = color || pal.accent;
  ctx.lineWidth = 2;
  ctx.fillStyle = color ? `${color}2e` : pal.accentSoft;

  if (draft.kind === 'rect' || draft.kind === 'note') {
    roundedPath(ctx, x, y, width, height, 10);
    ctx.fill();
    ctx.stroke();
  } else if (draft.kind === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (draft.kind === 'line' || draft.kind === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(draft.start.x, draft.start.y);
    ctx.lineTo(draft.end.x, draft.end.y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawLinkPreview(
  ctx: CanvasRenderingContext2D,
  input: RenderInput,
  pal: Palette,
): void {
  if (input.activeTool !== 'link' || !input.linkSourceId || !input.pointer) return;
  const source = input.doc.devices.find((device) => device.id === input.linkSourceId);
  if (!source) return;

  const target = input.hoveredId
    ? input.doc.devices.find((device) => device.id === input.hoveredId)
    : null;
  const from = anchorPoint(previewRect(source, input.preview), input.pointer);
  const to = target
    ? anchorPoint(previewRect(target, input.preview), from)
    : input.pointer;

  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(to.x, to.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = pal.accent;
  ctx.fill();
  ctx.restore();
}

export function renderScene(input: RenderInput): void {
  const { ctx, width, height, dpr, view } = input;
  const pal = PALETTES[input.theme];

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = pal.background;
  ctx.fillRect(0, 0, width, height);

  ctx.translate(view.x, view.y);
  ctx.scale(view.zoom, view.zoom);

  const viewRect: Rect = {
    x: -view.x / view.zoom,
    y: -view.y / view.zoom,
    width: width / view.zoom,
    height: height / view.zoom,
  };

  if (input.doc.settings.showGrid !== false) drawGrid(ctx, input, pal);

  const plan = layerPlan(input.doc.layers);
  for (const layer of plan.layers) {
    if (layer.kind === 'structure') {
      drawLinks(ctx, input, pal);
      drawDevices(ctx, input, pal, viewRect);
      drawPortDots(ctx, input, pal, viewRect);
    } else {
      const items = input.doc.annotations.filter((annotation) => annotation.layerId === layer.id);
      for (const annotation of items) {
        if (!rectsIntersect(annotationRect(annotation), viewRect)) continue;
        drawAnnotation(ctx, annotation, pal, input.selectedAnnotationId === annotation.id);
      }
    }
  }

  const selectedAnnotation = input.selectedAnnotationId
    ? input.doc.annotations.find((item) => item.id === input.selectedAnnotationId)
    : null;
  if (selectedAnnotation) {
    drawAnnotationHandles(ctx, selectedAnnotation, view.zoom, pal);
  }

  // Направляющие выравнивания — поверх содержимого, под черновиком.
  if (input.guides && input.guides.length > 0) {
    ctx.save();
    ctx.strokeStyle = pal.accent;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1 / view.zoom;
    ctx.setLineDash([6 / view.zoom, 5 / view.zoom]);
    for (const guide of input.guides) {
      ctx.beginPath();
      if (guide.axis === 'x') {
        ctx.moveTo(guide.value, viewRect.y);
        ctx.lineTo(guide.value, viewRect.y + viewRect.height);
      } else {
        ctx.moveTo(viewRect.x, guide.value);
        ctx.lineTo(viewRect.x + viewRect.width, guide.value);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Черновик фигуры и линия будущей связи — всегда сверху.
  if (input.draft) drawDraft(ctx, input.draft, pal, input.annotationColor);
  drawLinkPreview(ctx, input, pal);

  ctx.restore();
}

/** Прямоугольник, который занимает сцена: используется для «вписать всё». */
export function sceneRects(doc: ProjectDocument): Rect[] {
  const rects: Rect[] = doc.devices.map(nodeRect);
  for (const annotation of doc.annotations) {
    rects.push(annotationRect(annotation));
  }
  return rects;
}

export type { Point };
