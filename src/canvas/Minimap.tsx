/**
 * Мини-карта холста: уменьшенный обзор всей схемы и текущей области просмотра.
 * Клик или перетаскивание по карте центрируют основной холст на выбранной точке.
 */

import { useEffect, useRef } from 'preact/hooks';
import type { ProjectDocument } from '../core/project';
import {
  type Point,
  type Rect,
  type Viewport,
  annotationRect,
  nodeRect,
  screenToWorld,
  unionRects,
} from './geometry';
import { PALETTES, type ThemeName } from './render';
import { t } from '../i18n';

const WIDTH = 190;
const HEIGHT = 132;
const PADDING = 10;

interface MinimapProps {
  doc: ProjectDocument;
  view: Viewport;
  size: { width: number; height: number };
  theme: ThemeName;
  onNavigate: (world: Point) => void;
}

interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function Minimap({ doc, view, size, theme, onNavigate }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef<Transform | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(WIDTH * dpr);
    const pixelHeight = Math.round(HEIGHT * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pal = PALETTES[theme];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = pal.background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const rects: Rect[] = doc.devices.map(nodeRect);
    for (const annotation of doc.annotations) rects.push(annotationRect(annotation));
    const bounds = unionRects(rects);
    if (!bounds) {
      transformRef.current = null;
      return;
    }

    const scale = Math.min(
      (WIDTH - PADDING * 2) / Math.max(bounds.width, 1),
      (HEIGHT - PADDING * 2) / Math.max(bounds.height, 1),
    );
    const offsetX = (WIDTH - bounds.width * scale) / 2 - bounds.x * scale;
    const offsetY = (HEIGHT - bounds.height * scale) / 2 - bounds.y * scale;
    transformRef.current = { scale, offsetX, offsetY };
    const toMini = (point: Point) => ({
      x: point.x * scale + offsetX,
      y: point.y * scale + offsetY,
    });

    // Связи — тонкими линиями между центрами устройств.
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 1;
    for (const link of doc.links) {
      const a = doc.devices.find((device) => device.id === link.a.deviceId);
      const b = doc.devices.find((device) => device.id === link.b.deviceId);
      if (!a || !b) continue;
      const ra = nodeRect(a);
      const rb = nodeRect(b);
      const from = toMini({ x: ra.x + ra.width / 2, y: ra.y + ra.height / 2 });
      const to = toMini({ x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 });
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    // Устройства.
    for (const device of doc.devices) {
      const rect = nodeRect(device);
      const point = toMini(rect);
      ctx.fillStyle = pal.node;
      ctx.strokeStyle = pal.border;
      ctx.beginPath();
      ctx.rect(
        point.x,
        point.y,
        Math.max(2, rect.width * scale),
        Math.max(2, rect.height * scale),
      );
      ctx.fill();
      ctx.stroke();
    }

    // Текущая область просмотра.
    const topLeft = screenToWorld({ x: 0, y: 0 }, view);
    const bottomRight = screenToWorld({ x: size.width, y: size.height }, view);
    const viewTopLeft = toMini(topLeft);
    const viewSize = {
      width: (bottomRight.x - topLeft.x) * scale,
      height: (bottomRight.y - topLeft.y) * scale,
    };
    ctx.fillStyle = pal.accentSoft;
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(viewTopLeft.x, viewTopLeft.y, viewSize.width, viewSize.height);
    ctx.fill();
    ctx.stroke();
  }, [doc, view, size.width, size.height, theme]);

  const navigateTo = (event: PointerEvent) => {
    const canvas = canvasRef.current;
    const transform = transformRef.current;
    if (!canvas || !transform) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const mx = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const my = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    onNavigate({
      x: (mx - transform.offsetX) / transform.scale,
      y: (my - transform.offsetY) / transform.scale,
    });
  };

  return (
    <canvas
      ref={canvasRef}
      class="canvas-minimap"
      title={t('canvas.minimap.hint')}
      onPointerDown={(event) => {
        event.preventDefault();
        draggingRef.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        navigateTo(event);
      }}
      onPointerMove={(event) => {
        if (!draggingRef.current) return;
        navigateTo(event);
      }}
      onPointerUp={(event) => {
        draggingRef.current = false;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
    />
  );
}
