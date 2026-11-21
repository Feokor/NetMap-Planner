import { describe, expect, it } from 'vitest';
import type { Device, Layer, ProjectDocument } from '../src/core/project';
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  anchorPoint,
  clampZoom,
  distanceToPolyline,
  findFreeSpot,
  fitViewport,
  gridStep,
  hitTestDevices,
  layerPlan,
  linkGeometry,
  nodeRect,
  offsetPolyline,
  pointAtFraction,
  portAnchorPoint,
  screenToWorld,
  snap,
  worldToScreen,
  zoomAt,
} from '../src/canvas/geometry';
import { generateExportFilename } from '../src/canvas/export';

function device(id: string, x: number, y: number, overrides: Partial<Device> = {}): Device {
  return {
    id,
    name: id,
    kind: 'pc',
    attrs: { layer: 'L3' },
    tags: [],
    ports: [],
    canvas: { x, y },
    ...overrides,
  };
}

describe('canvas geometry', () => {
  it('uses default node size and honors overrides', () => {
    expect(nodeRect(device('a', 10, 20))).toEqual({
      x: 10,
      y: 20,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
    expect(nodeRect(device('a', 1, 2, { canvas: { x: 1, y: 2, width: 50, height: 40 } }))).toEqual({
      x: 1,
      y: 2,
      width: 50,
      height: 40,
    });
  });

  it('clips link anchors to the rectangle border', () => {
    const rect = { x: 0, y: 0, width: 100, height: 60 };
    expect(anchorPoint(rect, { x: 500, y: 30 })).toEqual({ x: 100, y: 30 });
    expect(anchorPoint(rect, { x: -500, y: 30 })).toEqual({ x: 0, y: 30 });
    expect(anchorPoint(rect, { x: 50, y: -500 })).toEqual({ x: 50, y: 0 });
    expect(anchorPoint(rect, { x: 50, y: 30 })).toEqual({ x: 50, y: 30 });
  });

  it('routes links through bend points', () => {
    const a = { x: 0, y: 0, width: 100, height: 60 };
    const b = { x: 300, y: 0, width: 100, height: 60 };
    const straight = linkGeometry(a, b);
    expect(straight).toHaveLength(3);
    expect(straight[0].x).toBeCloseTo(100);
    expect(straight[straight.length - 1].x).toBeCloseTo(300);
    expect(straight[1].x).toBeCloseTo(200);

    const bent = linkGeometry(a, b, [{ x: 200, y: 200 }]);
    expect(bent).toHaveLength(3);
    expect(bent[1]).toEqual({ x: 200, y: 200 });
  });

  it('finds points along the polyline', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(pointAtFraction(points, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAtFraction(points, 0.5)).toEqual({ x: 100, y: 0 });
    expect(pointAtFraction(points, 1)).toEqual({ x: 100, y: 100 });
  });

  it('snaps and clamps', () => {
    expect(snap(37, 16)).toBe(32);
    expect(snap(41, 16)).toBe(48);
    expect(snap(41, 0)).toBe(41);
    expect(clampZoom(0.01)).toBe(0.2);
    expect(clampZoom(10)).toBe(3);
  });

  it('converts between screen and world coordinates', () => {
    const view = { x: 120, y: 80, zoom: 1.5 };
    const screen = { x: 420, y: 310 };
    const world = screenToWorld(screen, view);
    expect(worldToScreen(world, view)).toEqual(screen);
  });

  it('keeps the cursor anchor fixed while zooming', () => {
    const view = { x: 10, y: 20, zoom: 1 };
    const anchor = { x: 300, y: 200 };
    const before = screenToWorld(anchor, view);
    const next = zoomAt(view, anchor, 2.4);
    const after = screenToWorld(anchor, next);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.zoom).toBeCloseTo(2.4);
  });

  it('fits content into the viewport', () => {
    const view = fitViewport([{ x: 0, y: 0, width: 400, height: 200 }], 1000, 800, 50);
    expect(view.zoom).toBeGreaterThan(1);
    const center = worldToScreen({ x: 200, y: 100 }, view);
    expect(center.x).toBeCloseTo(500);
    expect(center.y).toBeCloseTo(400);
  });

  it('keeps grid spacing readable across zoom levels', () => {
    for (const zoom of [0.2, 0.5, 1, 2, 3]) {
      const step = gridStep(zoom, 16);
      expect(step * zoom).toBeGreaterThanOrEqual(9);
      expect(step * zoom).toBeLessThanOrEqual(44);
    }
  });

  it('hits the topmost device', () => {
    const devices = [device('bottom', 0, 0), device('top', 20, 20)];
    expect(hitTestDevices(devices, { x: 30, y: 30 })?.id).toBe('top');
    expect(hitTestDevices(devices, { x: 500, y: 500 })).toBeNull();
  });

  it('measures distance to a polyline', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(distanceToPolyline(line, { x: 50, y: 10 })).toBeCloseTo(10);
    expect(distanceToPolyline(line, { x: 50, y: 0 })).toBeCloseTo(0);
    expect(distanceToPolyline([], { x: 0, y: 0 })).toBe(Number.POSITIVE_INFINITY);
  });

  it('spreads ports along the border facing the target', () => {
    const rect = { x: 0, y: 0, width: 160, height: 80 };
    const target = { x: 400, y: 40 };
    const first = portAnchorPoint(rect, target, 0, 3);
    const last = portAnchorPoint(rect, target, 2, 3);
    expect(first.x).toBeCloseTo(160);
    expect(last.x).toBeCloseTo(160);
    expect(last.y).toBeGreaterThan(first.y);
    expect(portAnchorPoint(rect, target, 0, 1)).toEqual(anchorPoint(rect, target));
  });

  it('offsets parallel links perpendicular to their direction', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const shifted = offsetPolyline(points, 10);
    expect(shifted[0].x).toBeCloseTo(0);
    expect(shifted[0].y).toBeCloseTo(10);
    expect(shifted[1].y).toBeCloseTo(10);
    expect(offsetPolyline(points, 0)).toBe(points);
  });

  it('finds a free spot for a new node', () => {
    const occupied = [{ x: 0, y: 0, width: 176, height: 78 }];
    const spot = findFreeSpot(occupied, { width: 176, height: 78 }, { x: 0, y: 0 }, { step: 24 });
    expect(spot).not.toEqual({ x: 0, y: 0 });
    const rect = { x: spot.x, y: spot.y, width: 176, height: 78 };
    const overlaps = occupied.some(
      (item) =>
        rect.x < item.x + item.width &&
        rect.x + rect.width > item.x &&
        rect.y < item.y + item.height &&
        rect.y + rect.height > item.y,
    );
    expect(overlaps).toBe(false);
  });
});

describe('layer order', () => {
  const layers: Layer[] = [
    { id: 'notes', name: 'Заметки', kind: 'annotation', z: 10, visible: true, locked: false },
    { id: 'structure', name: 'Устройства', kind: 'structure', z: 100, visible: true, locked: false, pinnedTop: true },
    { id: 'hidden', name: 'Скрытый', kind: 'annotation', z: 200, visible: false, locked: false },
  ];

  it('pins the structure layer above annotations by default', () => {
    const plan = layerPlan(layers);
    expect(plan.layers.map((layer) => layer.id)).toEqual(['notes', 'structure']);
    expect(plan.structureAt).toBe(1);
  });

  it('respects z-order when pinning is disabled', () => {
    const unpinned = layers.map((layer) =>
      layer.id === 'structure' ? { ...layer, pinnedTop: false } : layer,
    );
    const plan = layerPlan(unpinned);
    expect(plan.layers.map((layer) => layer.id)).toEqual(['notes', 'structure']);
    expect(plan.structureAt).toBe(1);

    const highNotes = layers.map((layer) => {
      if (layer.kind === 'annotation' && layer.id === 'notes') return { ...layer, z: 500 };
      if (layer.kind === 'structure') return { ...layer, pinnedTop: false };
      return layer;
    });
    const plan2 = layerPlan(highNotes);
    expect(plan2.layers.map((layer) => layer.id)).toEqual(['structure', 'notes']);
    expect(plan2.structureAt).toBe(0);
  });

  it('reports a hidden structure layer', () => {
    const hidden = layers.map((layer) =>
      layer.kind === 'structure' ? { ...layer, visible: false } : layer,
    );
    const plan = layerPlan(hidden);
    expect(plan.layers.map((layer) => layer.id)).toEqual(['notes']);
    expect(plan.structureAt).toBe(-1);
  });
});

describe('generateExportFilename', () => {
  const doc = (name: string) => ({ name }) as unknown as ProjectDocument;

  it('keeps letters, digits and spaces, lowercases the rest', () => {
    const filename = generateExportFilename(doc('Мой Сеть 42'), 'png');
    expect(filename).toMatch(/^vibe-мой сеть 42-\d+\.png$/);
  });

  it('replaces unsafe characters with underscores', () => {
    const filename = generateExportFilename(doc('core/switch: "A"<B>?'), 'png');
    const base = filename.slice('vibe-'.length, filename.lastIndexOf('-'));
    expect(base).not.toMatch(/[/:"<>?\\|*]/);
    expect(base).toMatch(/^[a-zа-яё0-9_ ]+$/);
  });

  it('limits the project name to 30 characters', () => {
    const long = 'x'.repeat(100);
    const filename = generateExportFilename(doc(long), 'json');
    const base = filename.slice('vibe-'.length, filename.lastIndexOf('-'));
    expect(base).toHaveLength(30);
    expect(filename.endsWith('.json')).toBe(true);
  });
});
