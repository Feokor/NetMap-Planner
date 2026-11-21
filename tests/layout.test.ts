import { describe, expect, it } from 'vitest';
import { createDevice, createProject, type Device, type Link, type ProjectDocument } from '../src/core/project';
import { autoLayout } from '../src/canvas/layout';
import { NODE_HEIGHT, NODE_WIDTH } from '../src/canvas/geometry';

function device(name: string, x: number, y: number): Device {
  return createDevice({ name, canvas: { x, y } });
}

function link(a: Device, b: Device): Link {
  return {
    id: `lnk_${a.id}_${b.id}`,
    a: { deviceId: a.id },
    b: { deviceId: b.id },
    media: 'copper',
  };
}

function docWith(devices: Device[], links: Link[] = []): ProjectDocument {
  const doc = createProject('Тест');
  return { ...doc, devices, links };
}

describe('авто-раскладка', () => {
  it('раскладывает цепочку по уровням сверху вниз', () => {
    const a = device('A', 0, 0);
    const b = device('B', 500, 300);
    const c = device('C', 10, 900);
    const positions = autoLayout(docWith([a, b, c], [link(a, b), link(b, c)]));

    const pa = positions.get(a.id)!;
    const pb = positions.get(b.id)!;
    const pc = positions.get(c.id)!;
    expect(pa.y).toBe(0);
    expect(pb.y).toBe(NODE_HEIGHT + 72);
    expect(pc.y).toBe((NODE_HEIGHT + 72) * 2);
    expect(pa.x).toBe(pb.x);
    expect(pb.x).toBe(pc.x);
  });

  it('ставит соседей одного уровня рядом без наложений', () => {
    const root = device('root', 0, 0);
    const left = device('left', -400, 200);
    const right = device('right', 400, 200);
    const positions = autoLayout(docWith([root, left, right], [link(root, left), link(root, right)]));

    const pl = positions.get(left.id)!;
    const pr = positions.get(right.id)!;
    expect(pl.y).toBe(pr.y);
    expect(Math.abs(pl.x - pr.x)).toBeGreaterThanOrEqual(NODE_WIDTH + 48);
  });

  it('кладёт изолированные устройства в нижний ряд', () => {
    const a = device('A', 0, 0);
    const b = device('B', 100, 100);
    const lonely = device('lonely', -200, -400);
    const positions = autoLayout(docWith([a, b, lonely], [link(a, b)]));

    const pb = positions.get(b.id)!;
    const pl = positions.get(lonely.id)!;
    expect(pl.y).toBeGreaterThan(pb.y);
    expect(positions.get(a.id)!.y).toBe(0);
  });

  it('не двигает устройства из другой связной компоненты на тот же уровень', () => {
    const a = device('A', 0, 0);
    const b = device('B', 100, 100);
    const c = device('C', 50, 500);
    const d = device('D', 150, 600);
    const positions = autoLayout(docWith([a, b, c, d], [link(a, b), link(c, d)]));

    expect(positions.get(b.id)!.y).toBe(NODE_HEIGHT + 72);
    expect(positions.get(c.id)!.y).toBeGreaterThan(positions.get(b.id)!.y);
    expect(positions.get(d.id)!.y).toBeGreaterThan(positions.get(c.id)!.y);
  });

  it('прилипает к сетке проекта', () => {
    const a = device('A', 3, 5);
    const b = device('B', 7, 9);
    const positions = autoLayout(docWith([a, b], [link(a, b)]), { grid: 32 });

    for (const point of positions.values()) {
      expect(Math.abs(point.x % 32)).toBe(0);
      expect(Math.abs(point.y % 32)).toBe(0);
    }
  });

  it('возвращает пустую карту для пустого проекта', () => {
    const positions = autoLayout(docWith([]));
    expect(positions.size).toBe(0);
  });
});
